"use client";
import Breadcrumb from "@/components/Breadcrumb";
import Image from "next/image";
import { DataTable } from "@/components/DataTable";
import { createColumnHelper, type SortingState } from "@tanstack/react-table";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "@/lib/formatDate";

// Borrow / Return ("ยืม / คืน") tracking. A "loan" is a takeaway (Scan.takeawayQty > 0);
// the return side is tracked on the same Scan. See src/lib/loanStatus.ts and /api/loans.

interface Loan {
  scanId: string;
  customerId: string | null;
  customerCode: string;
  customerName: string;
  customerCompany: string;
  customerPhone: string;
  product: { id: string; name: string; productCode: string | null; imageUrl: string | null; brand: string | null; colour: string | null; size: string | null };
  borrowedQty: number;
  returnedQty: number;
  remaining: number;
  borrowedAt: string;
  dueDate: string;
  dueOverridden: boolean;
  returnedAt: string | null;
  status: "OUT" | "OVERDUE" | "RETURNED";
  daysOverdue: number;
  borrowerNote: string;
  borrowedAtOverride: boolean;
}
interface Counts { all: number; outstanding: number; overdue: number; returned: number }

const STATUS: Record<Loan["status"], { label: string; bg: string; color: string }> = {
  OUT:      { label: "Out",      bg: "#fef3c7", color: "#b45309" },
  OVERDUE:  { label: "Overdue",  bg: "#fee2e2", color: "var(--color-danger)" },
  RETURNED: { label: "Returned", bg: "#d1fae5", color: "var(--color-success)" },
};
const TABS: { key: string; label: string; countKey: keyof Counts }[] = [
  { key: "outstanding", label: "Outstanding", countKey: "outstanding" },
  { key: "overdue",     label: "Overdue",     countKey: "overdue" },
  { key: "returned",    label: "Returned",    countKey: "returned" },
  { key: "all",         label: "All",         countKey: "all" },
];

const fmtDate = (d: string | null) => (d ? formatDate(d) : "—");
const toDateInput = (d: string) => new Date(d).toLocaleDateString("en-CA"); // YYYY-MM-DD (local)

const columnHelper = createColumnHelper<Loan>();

export default function LoansPage() {
  const [tab, setTab] = useState("outstanding"); // status scope (not a column filter)
  const [searchInput, setSearchInput] = useState("");
  const globalFilter = useDebouncedValue(searchInput, 300);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [counts, setCounts] = useState<Counts>({ all: 0, outstanding: 0, overdue: 0, returned: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const reqSeq = useRef(0);

  const load = useCallback(async (showSpin = false) => {
    const seq = ++reqSeq.current;
    if (showSpin) { setLoading(true); setLoadError(false); }
    try {
      const u = new URL("/api/loans", window.location.origin);
      u.searchParams.set("status", tab);
      u.searchParams.set("page", String(page));
      if (globalFilter.trim()) u.searchParams.set("q", globalFilter.trim());
      const s = sorting[0];
      if (s) { u.searchParams.set("sort", s.id); u.searchParams.set("dir", s.desc ? "desc" : "asc"); }
      const res = await fetch(u.toString());
      if (!res.ok) throw new Error("request failed");
      const d = await res.json();
      if (seq !== reqSeq.current) return;
      setLoans(d.loans || []);
      setCounts(d.counts || { all: 0, outstanding: 0, overdue: 0, returned: 0 });
      setTotalPages(d.totalPages || 1);
    } catch {
      if (seq === reqSeq.current && showSpin) setLoadError(true);
    } finally {
      if (seq === reqSeq.current && showSpin) setLoading(false);
    }
  }, [tab, globalFilter, sorting, page]);

  // Reload whenever tab / search / sort / page change; poll every 15s for cross-station changes.
  useEffect(() => { load(true); }, [load]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [tab, globalFilter, sorting]);
  useEffect(() => {
    const t = setInterval(() => load(false), 15000);
    return () => clearInterval(t);
  }, [load]);

  async function patch(scanId: string, body: Record<string, unknown>) {
    setBusy((b) => ({ ...b, [scanId]: true }));
    try {
      const r = await fetch(`/api/loans/${scanId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (r.ok) await load(false);
    } finally {
      setBusy((b) => ({ ...b, [scanId]: false }));
    }
  }
  const returnAll = (l: Loan) => patch(l.scanId, { returnAll: true });
  const setReturned = (l: Loan, qty: number) => patch(l.scanId, { returnedQty: Math.max(0, Math.min(l.borrowedQty, qty)) });
  const setDue = (l: Loan, value: string) => patch(l.scanId, { dueDate: value ? new Date(value).toISOString() : null });

  const columns = useMemo(() => [
    columnHelper.accessor((l) => l.product.name, { id: "item", header: "Item", cell: ({ row }) => {
      const l = row.original;
      const meta = [l.product.brand, l.product.colour, l.product.size].filter(Boolean).join(" · ");
      return (
        <div className="flex items-center gap-2.5 min-w-0">
          {l.product.imageUrl
            ? <Image src={l.product.imageUrl} alt="" width={40} height={40} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
            : <div className="w-10 h-10 rounded-lg flex-shrink-0" style={{ background: "var(--color-border)" }} />}
          <div className="min-w-0">
            <p className="font-medium truncate" style={{ color: "var(--color-text)", maxWidth: 220 }}>{l.product.name}</p>
            <p className="text-xs truncate" style={{ color: "var(--color-text-muted)", maxWidth: 220 }}>{[l.product.productCode, meta].filter(Boolean).join(" · ") || "—"}</p>
          </div>
        </div>
      );
    } }),
    columnHelper.accessor((l) => l.customerName, { id: "customer", header: "Customer", cell: ({ row }) => {
      const l = row.original;
      return (
        <div>
          {l.customerId ? (
            <a href={`/admin/customers/${l.customerId}`} target="_blank" rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:opacity-80" style={{ color: "var(--color-primary)" }}>{l.customerName}</a>
          ) : <span className="font-medium" style={{ color: "var(--color-text)" }}>{l.customerName}</span>}
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{[l.customerCode, l.customerPhone].filter(Boolean).join(" · ")}</p>
        </div>
      );
    } }),
    columnHelper.accessor((l) => l.customerName, { id: "customer", header: "Customer", cell: ({ row }) => {
      const l = row.original;
      return (
        <div>
          {l.borrowerNote && (
            <span className="text-[10px] px-1 py-0.5 rounded mr-1" style={{ background: "var(--color-info-bg, #dbeafe)", color: "var(--color-text)" }} title="Manually corrected borrower">{l.borrowerNote}</span>
          )}
          {l.customerId ? (
            <a href={`/admin/customers/${l.customerId}`} target="_blank" rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:opacity-80" style={{ color: "var(--color-primary)" }}>{l.customerName}</a>
          ) : <span className="font-medium" style={{ color: "var(--color-text)" }}>{l.customerName}</span>}
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {[l.customerCode, l.customerPhone].filter(Boolean).join(" · ")}
          </p>
          <BorrowerNoteInline scanId={l.scanId} initial={l.borrowerNote} onSaved={() => load(false)} />
        </div>
      );
    } }),
    columnHelper.accessor("borrowedAt", { id: "borrowedAt", header: "Borrowed", cell: ({ row }) => {
      const l = row.original;
      // Slide 32: staff can correct the real take date (the scan time is only the default).
      return (
        <div className="flex flex-col gap-0.5">
          <input type="date" value={toDateInput(l.borrowedAt)} onChange={(e) => patch(l.scanId, { borrowedAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            title="Correct the borrow date"
            className="px-1.5 py-1 rounded-md text-xs"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "var(--color-surface)" }} />
          {l.borrowedAtOverride && <button onClick={() => patch(l.scanId, { borrowedAt: null })} className="text-[11px] underline text-left" style={{ color: "var(--color-text-muted)" }}>reset</button>}
        </div>
      );
    } }),
    columnHelper.accessor("dueDate", { id: "dueDate", header: "Due", cell: ({ row }) => {
      const l = row.original;
      if (l.status === "RETURNED") return <span style={{ color: "var(--color-text-muted)" }}>{fmtDate(l.dueDate)}</span>;
      return (
        <div className="flex flex-col gap-0.5">
          <input type="date" value={toDateInput(l.dueDate)} onChange={(e) => setDue(l, e.target.value)}
            className="px-1.5 py-1 rounded-md text-xs"
            style={{ border: "1px solid var(--color-border)", color: l.status === "OVERDUE" ? "var(--color-danger)" : "var(--color-text)", background: "var(--color-surface)" }} />
          {l.status === "OVERDUE" && <span className="text-[11px] font-medium" style={{ color: "var(--color-danger)" }}>{l.daysOverdue}d overdue</span>}
        </div>
      );
    } }),
    columnHelper.display({ id: "returned", header: "Returned", cell: ({ row }) => {
      const l = row.original;
      return (
        <div className="flex items-center gap-1.5">
          <button onClick={() => setReturned(l, l.returnedQty - 1)} disabled={busy[l.scanId] || l.returnedQty <= 0}
            className="w-6 h-6 rounded-md text-sm leading-none disabled:opacity-30" style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>−</button>
          <span className="tabular-nums text-center" style={{ minWidth: 34, color: "var(--color-text)" }}>{l.returnedQty}<span style={{ color: "var(--color-text-subtle)" }}> / {l.borrowedQty}</span></span>
          <button onClick={() => setReturned(l, l.returnedQty + 1)} disabled={busy[l.scanId] || l.returnedQty >= l.borrowedQty}
            className="w-6 h-6 rounded-md text-sm leading-none disabled:opacity-30" style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>+</button>
        </div>
      );
    } }),
    columnHelper.accessor("status", { header: "Status", cell: (i) => {
      const st = STATUS[i.getValue()];
      return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.color }}>{st.label}</span>;
    } }),
    columnHelper.display({ id: "action", header: "Action", enableHiding: false, cell: ({ row }) => {
      const l = row.original;
      return l.remaining > 0 ? (
        <button onClick={() => returnAll(l)} disabled={busy[l.scanId]}
          className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50" style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>↩ Return all</button>
      ) : (
        <span className="text-xs" style={{ color: "var(--color-success)" }}>{l.returnedAt ? `✓ ${fmtDate(l.returnedAt)}` : "✓"}</span>
      );
    } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [busy]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>Borrow / Return</h1>
        <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Borrow" }, { label: "Return" }]} />
        <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>Items a customer took (takeaway) and whether they came back</p>
      </div>

      <DataTable
        tableId="loans"
        columns={columns}
        data={loans}
        loading={loading}
        error={loadError}
        onRetry={() => load(true)}
        errorMessage="Could not load loans. Please try again."
        emptyMessage="No loans here"
        sorting={sorting}
        onSortingChange={setSorting}
        globalFilter={globalFilter}
        onGlobalFilterChange={setSearchInput}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        getRowId={(l) => l.scanId}
        rowStyle={(l) => (busy[l.scanId] ? { opacity: 0.5 } : undefined)}
        toolbar={
          <>
            {/* Search — fills the row on mobile, fixed on larger screens */}
            <div className="w-full sm:w-56 flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
              <svg width="14" height="14" fill="none" stroke="var(--color-icon-muted)" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search customer or item…"
                className="outline-none text-sm bg-transparent w-full" style={{ color: "var(--color-text)" }} />
            </div>
            {/* Status scope — a horizontal-scroll strip of chips */}
            <div className="w-full sm:w-auto min-w-0 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {TABS.map((t) => {
                const active = tab === t.key;
                const n = counts[t.countKey];
                const danger = t.key === "overdue" && n > 0;
                return (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className="px-3.5 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 flex-shrink-0"
                    style={{
                      background: active ? "var(--color-primary)" : "var(--color-surface)",
                      color: active ? "var(--color-surface)" : danger ? "var(--color-danger)" : "var(--color-text)",
                      border: `1px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
                    }}>
                    <span>{t.label}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: active ? "rgba(255,255,255,0.25)" : danger ? "#fee2e2" : "var(--color-bg)", color: active ? "var(--color-surface)" : danger ? "var(--color-danger)" : "var(--color-text-muted)" }}>{n}</span>
                  </button>
                );
              })}
            </div>
          </>
        }
      />
    </div>
  );
}

// Slide 32: inline "actual borrower" correction — click to type who really took the item
// (e.g. a colleague of the registered customer). Saves straight to Scan.borrowerNote.
function BorrowerNoteInline({ scanId, initial, onSaved }: { scanId: string; initial: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  if (!editing) {
    return (
      <button onClick={() => { setValue(initial); setEditing(true); }} className="text-[11px] underline" style={{ color: "var(--color-text-subtle)" }}>
        {initial ? "edit borrower" : "correct borrower"}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1 mt-0.5">
      <input value={value} autoFocus onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (async () => {
          setSaving(true);
          await fetch(`/api/loans/${scanId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ borrowerNote: value }) });
          setSaving(false); setEditing(false); onSaved();
        })()}
        placeholder="Actual borrower"
        className="w-full px-1.5 py-0.5 rounded-md text-[11px] outline-none"
        style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }} />
      <button disabled={saving} onClick={async () => {
        setSaving(true);
        await fetch(`/api/loans/${scanId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ borrowerNote: value }) });
        setSaving(false); setEditing(false); onSaved();
      }} className="text-[11px] px-1 rounded-md font-medium" style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>✓</button>
    </span>
  );
}
