"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useCallback, useEffect, useRef, useState } from "react";

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
}
interface Counts { all: number; outstanding: number; overdue: number; returned: number }

const card = { background: "#fff", border: "1px solid #e6e5d8", borderRadius: 16 };
const STATUS: Record<Loan["status"], { label: string; bg: string; color: string }> = {
  OUT:      { label: "Out",      bg: "#fef3c7", color: "#b45309" },
  OVERDUE:  { label: "Overdue",  bg: "#fee2e2", color: "#dc2626" },
  RETURNED: { label: "Returned", bg: "#d1fae5", color: "#10b981" },
};
const TABS: { key: string; label: string; countKey: keyof Counts }[] = [
  { key: "outstanding", label: "Outstanding", countKey: "outstanding" },
  { key: "overdue",     label: "Overdue",     countKey: "overdue" },
  { key: "returned",    label: "Returned",    countKey: "returned" },
  { key: "all",         label: "All",         countKey: "all" },
];

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");
const toDateInput = (d: string) => new Date(d).toLocaleDateString("en-CA"); // YYYY-MM-DD (local)

export default function LoansPage() {
  const [tab, setTab] = useState("outstanding");
  const [query, setQuery] = useState("");
  const [loans, setLoans] = useState<Loan[]>([]);
  const [counts, setCounts] = useState<Counts>({ all: 0, outstanding: 0, overdue: 0, returned: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const qRef = useRef(query);
  qRef.current = query;

  const load = useCallback(async (showSpin = false) => {
    if (showSpin) setLoading(true);
    try {
      const u = new URL("/api/loans", window.location.origin);
      u.searchParams.set("status", tab);
      if (qRef.current.trim()) u.searchParams.set("q", qRef.current.trim());
      const d = await fetch(u.toString()).then((r) => r.json());
      setLoans(d.loans || []);
      setCounts(d.counts || { all: 0, outstanding: 0, overdue: 0, returned: 0 });
    } catch { /* keep last good data */ }
    finally { if (showSpin) setLoading(false); }
  }, [tab]);

  // Reload on tab change + debounced on search; poll every 15s for cross-station changes.
  useEffect(() => { load(true); }, [tab, load]);
  useEffect(() => {
    const t = setTimeout(() => load(false), 300);
    return () => clearTimeout(t);
  }, [query, load]);
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

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Borrow / Return</h1>
        <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Notifications", href: "/admin/notifications" }, { label: "Borrow & Return" }]} />
        <p className="text-xs mt-1" style={{ color: "#6f5f48" }}>ยืม / คืนสินค้า · items a customer took (takeaway) and whether they came back</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-3">
        {TABS.map((t) => {
          const active = tab === t.key;
          const n = counts[t.countKey];
          const danger = t.key === "overdue" && n > 0;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="px-3.5 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5"
              style={{
                background: active ? "#726c5a" : "#fff",
                color: active ? "#fff" : danger ? "#dc2626" : "#4c4847",
                border: `1px solid ${active ? "#726c5a" : "#e6e5d8"}`,
              }}>
              <span>{t.label}</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: active ? "rgba(255,255,255,0.25)" : danger ? "#fee2e2" : "#f5f2ee", color: active ? "#fff" : danger ? "#dc2626" : "#6f5f48" }}>{n}</span>
            </button>
          );
        })}
        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer or item…"
          className="ml-auto px-3 py-1.5 rounded-lg text-sm w-full sm:w-64"
          style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847" }} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto" style={card}>
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f5f2ee", color: "#6f5f48" }}>
              {["Item", "Customer", "Borrowed", "Due", "Returned", "Status", ""].map((h, i) => (
                <th key={i} className="text-left font-medium px-3 py-2.5 whitespace-nowrap" style={{ borderBottom: "1px solid #e6e5d8" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center" style={{ color: "#6f5f48" }}>Loading…</td></tr>
            ) : loans.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center" style={{ color: "#8f8168" }}>No loans here</td></tr>
            ) : loans.map((l) => {
              const st = STATUS[l.status];
              const returned = l.status === "RETURNED";
              const meta = [l.product.brand, l.product.colour, l.product.size].filter(Boolean).join(" · ");
              return (
                <tr key={l.scanId} style={{ borderBottom: "1px solid #f0eee6", opacity: busy[l.scanId] ? 0.5 : 1 }}>
                  {/* Item */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {l.product.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={l.product.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        : <div className="w-10 h-10 rounded-lg flex-shrink-0" style={{ background: "#e6e5d8" }} />}
                      <div className="min-w-0">
                        <p className="font-medium truncate" style={{ color: "#4c4847", maxWidth: 220 }}>{l.product.name}</p>
                        <p className="text-xs truncate" style={{ color: "#6f5f48", maxWidth: 220 }}>{[l.product.productCode, meta].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                    </div>
                  </td>
                  {/* Customer */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {l.customerId ? (
                      <a href={`/admin/customers/${l.customerId}`} target="_blank" rel="noopener noreferrer"
                        className="font-medium hover:underline" style={{ color: "#726c5a" }}>{l.customerName}</a>
                    ) : <span className="font-medium" style={{ color: "#4c4847" }}>{l.customerName}</span>}
                    <p className="text-xs" style={{ color: "#6f5f48" }}>{[l.customerCode, l.customerPhone].filter(Boolean).join(" · ")}</p>
                  </td>
                  {/* Borrowed */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#4c4847" }}>{fmtDate(l.borrowedAt)}</td>
                  {/* Due */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {returned ? (
                      <span style={{ color: "#6f5f48" }}>{fmtDate(l.dueDate)}</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <input type="date" value={toDateInput(l.dueDate)} onChange={(e) => setDue(l, e.target.value)}
                          className="px-1.5 py-1 rounded-md text-xs"
                          style={{ border: "1px solid #e6e5d8", color: l.status === "OVERDUE" ? "#dc2626" : "#4c4847", background: "#fff" }} />
                        {l.status === "OVERDUE" && <span className="text-[11px] font-medium" style={{ color: "#dc2626" }}>{l.daysOverdue}d overdue</span>}
                      </div>
                    )}
                  </td>
                  {/* Returned x/y stepper */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setReturned(l, l.returnedQty - 1)} disabled={busy[l.scanId] || l.returnedQty <= 0}
                        className="w-6 h-6 rounded-md text-sm leading-none disabled:opacity-30" style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}>−</button>
                      <span className="tabular-nums text-center" style={{ minWidth: 34, color: "#4c4847" }}>{l.returnedQty}<span style={{ color: "#8f8168" }}> / {l.borrowedQty}</span></span>
                      <button onClick={() => setReturned(l, l.returnedQty + 1)} disabled={busy[l.scanId] || l.returnedQty >= l.borrowedQty}
                        className="w-6 h-6 rounded-md text-sm leading-none disabled:opacity-30" style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}>+</button>
                    </div>
                  </td>
                  {/* Status */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  </td>
                  {/* Action */}
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    {l.remaining > 0 ? (
                      <button onClick={() => returnAll(l)} disabled={busy[l.scanId]}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                        style={{ background: "#726c5a", color: "#fff" }}>↩ Return all</button>
                    ) : (
                      <span className="text-xs" style={{ color: "#10b981" }}>{l.returnedAt ? `✓ ${fmtDate(l.returnedAt)}` : "✓"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
