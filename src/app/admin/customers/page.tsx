"use client";
import { PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/Spinner";
import { Skeleton } from "@/components/Skeleton";
import { DataTable } from "@/components/DataTable";
import { createColumnHelper, type SortingState, type ColumnFiltersState } from "@tanstack/react-table";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toCsv } from "@/lib/csv";
import { CUSTOMER_TYPES, customerTypeLabel, customerTypeColor } from "@/lib/customerTypes";
import { formatDate } from "@/lib/formatDate";
import { toast } from "sonner";

const errorToast = { style: { background: "var(--color-danger-soft)", color: "var(--color-surface)", border: "none", borderRadius: "0.75rem" } };

const TITLE_OPTIONS = CUSTOMER_TYPES.map((t) => t.value);
// Fixed display order for the breakdown card (index by CUSTOMER_TYPES; unknowns last).
const TITLE_ORDER = new Map<string, number>(CUSTOMER_TYPES.map((t, i) => [t.value, i]));

interface Customer {
  id: string; customerCode: string; fullName: string; title: string;
  company: string; phone: string; email: string; knowChannel: string[]; createdAt: string; salesPerson?: string | null; source?: string | null;
}

const columnHelper = createColumnHelper<Customer>();

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const globalFilter = useDebouncedValue(searchInput, 300);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [byTitle, setByTitle] = useState<{ title: string; count: number }[]>([]);
  const [startingSession, setStartingSession] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [role, setRole] = useState("");
  const reqSeq = useRef(0);
  // Item 6: ONLY Super Admin may export the customer database.
  const canExport = role === "super_admin";
  // The Type filter is a real column filter (keyed by the "title" column id).
  const filterTitle = (columnFilters.find((f) => f.id === "title")?.value as string) ?? "all";

  useEffect(() => { fetchCustomers(); }, [globalFilter, columnFilters, sorting, page]);
  // Filter/sort changes reset to page 1; paging alone must not.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [globalFilter, columnFilters, sorting]);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.role) setRole(d.role); }); }, []);

  async function fetchCustomers() {
    const seq = ++reqSeq.current;
    setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams({ page: String(page) });
    if (globalFilter) params.set("search", globalFilter);
    if (filterTitle !== "all") params.set("title", filterTitle);
    const s = sorting[0];
    if (s) { params.set("sort", s.id); params.set("dir", s.desc ? "desc" : "asc"); }
    try {
      const res = await fetch(`/api/customers?${params}`);
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      if (seq !== reqSeq.current) return; // superseded by a newer request
      setCustomers(data.customers || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setByTitle(data.byTitle || []);
    } catch {
      if (seq === reqSeq.current) { setLoadError(true); setCustomers([]); }
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      // No ?page → the API returns the full array (all customers), for the CSV.
      const res = await fetch("/api/customers");
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) { toast("No data to export", errorToast); return; }
      const rows = [
        ["Code", "Full Name", "Title", "Company", "Phone", "Email", "Channels", "Source", "Sales", "Registered"],
        ...data.map((c: Customer) => [c.customerCode, c.fullName, c.title, c.company, c.phone, c.email, c.knowChannel.join(";"), c.source ?? "", c.salesPerson ?? "", formatDate(c.createdAt)]),
      ];
      const csv = toCsv(rows);
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `customers_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast("Export failed. Please try again.", errorToast);
    } finally {
      setExporting(false);
    }
  }

  async function handleStartScan(customer: Customer) {
    setStartingSession(customer.id);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerCode: customer.customerCode, customerId: customer.id }),
      });
      if (res.ok) {
        router.push(`/admin/rfid?customer=${customer.customerCode}&name=${encodeURIComponent(customer.fullName)}`);
      } else {
        toast("Could not start session", errorToast);
      }
    } finally {
      setStartingSession(null);
    }
  }

  const hasSearch = globalFilter.trim().length > 0 || filterTitle !== "all";
  // Occupation breakdown for the stats card — aggregate from the API (over the filtered set).
  // Customer Management card shows types in the fixed CUSTOMER_TYPES order (contractor's
  // request), not by count. Unknown titles (shouldn't occur post-fold) sort last.
  const byTitleSorted = [...byTitle].sort(
    (a, b) => (TITLE_ORDER.get(a.title) ?? 99) - (TITLE_ORDER.get(b.title) ?? 99),
  );

  const columns = useMemo(() => [
    columnHelper.accessor("customerCode", { header: "Code", cell: (i) => <code className="text-xs" style={{ color: "var(--color-text-muted)" }}>{i.getValue()}</code> }),
    columnHelper.accessor("fullName", { header: "Name", cell: (i) => <span className="font-medium" style={{ color: "var(--color-text)" }}>{i.getValue()}</span> }),
    columnHelper.accessor("title", { header: "Type", cell: (i) => {
      const t = i.getValue();
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: `${customerTypeColor(t)}20`, color: customerTypeColor(t) }}>{customerTypeLabel(t)}</span>;
    } }),
    columnHelper.accessor("company", { header: "Company", cell: (i) => <span className="text-xs" style={{ color: "var(--color-text)" }}>{i.getValue()}</span> }),
    columnHelper.accessor("phone", { header: "Phone", cell: (i) => <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{i.getValue()}</span> }),
    columnHelper.accessor("email", { header: "Email", cell: (i) => <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{i.getValue()}</span> }),
    columnHelper.display({ id: "channels", header: "Channels", cell: ({ row }) => {
      const ch = row.original.knowChannel;
      return (
        <div className="flex flex-wrap gap-1">
          {ch.slice(0, 2).map((c) => <span key={c} className="px-1.5 py-0.5 rounded text-xs" style={{ background: "var(--color-bg)", color: "var(--color-text-muted)" }}>{c}</span>)}
          {ch.length > 2 && <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>+{ch.length - 2}</span>}
        </div>
      );
    } }),
    columnHelper.accessor("createdAt", { header: "Registered", cell: (i) => <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{formatDate(i.getValue())}</span> }),
    columnHelper.display({ id: "actions", header: "Actions", enableHiding: false, cell: ({ row }) => {
      const c = row.original;
      return (
        <div className="flex items-center gap-2">
          <Link href={`/admin/customers/${c.id}`} className="px-3 py-1 rounded-lg text-xs" style={{ background: "var(--color-bg)", color: "var(--color-text-muted)" }}>View</Link>
          <button onClick={() => handleStartScan(c)} disabled={startingSession === c.id}
            title="Start Surface Scan" aria-label={`Start Surface Scan for ${c.fullName}`}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-50" style={{ background: "var(--color-primary)" }}>
            {startingSession === c.id ? <Spinner size="xs" color="#fff" /> : (
              <svg aria-hidden="true" width="12" height="12" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" /><path d="M3 17h4v4H3z" />
              </svg>
            )}
          </button>
        </div>
      );
    } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [startingSession]);

  return (
    <div>
      <PageHeader
        title="Customer Management"
        crumbs={[{ label: "Home", href: "/admin" }, { label: "Customer Management" }]}
        actions={<>
          {canExport && (
            <button onClick={handleExport} disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60 disabled:cursor-wait"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
              {exporting ? (
                <>
                  <svg className="animate-spin" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                  </svg>
                  Exporting…
                </>
              ) : (
                <>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export CSV
                </>
              )}
            </button>
          )}
          <Link href="/admin/customers/add" className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: "var(--color-primary)" }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Customer
          </Link>
        </>}
      />

      {/* Stats — total + occupation breakdown (aggregate from the API over the filtered set) */}
      <div className="p-5 rounded-xl mb-6 flex flex-col sm:flex-row gap-5" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="flex-shrink-0 sm:w-44 sm:pr-5 sm:border-r" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Total Members</p>
          {loading && byTitleSorted.length === 0 ? (
            // Don't flash a misleading "0" while the count loads — skeleton the number
            // at the same height (text-4xl line box) so the card doesn't shift either.
            <Skeleton className="h-10" style={{ width: "3.5rem" }} />
          ) : (
            <p className="text-4xl font-semibold" style={{ color: "var(--color-text)" }}>{total}</p>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm mb-2" style={{ color: "var(--color-text-muted)" }}>Type of Customers</p>
          {/* min-height reserves ~5 rows so the common case doesn't shift the table when
              the bars arrive, while still GROWING to show every active type (up to 15) —
              seeing all types at a glance matters more than chasing an already-"good" CLS
              to zero, and a fixed height would hide the overflow behind a scroll. */}
          <div className="min-h-[6.5rem]">
          {loading && byTitleSorted.length === 0 ? (
            <div className="space-y-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 h-4">
                  <Skeleton className="h-3" style={{ width: "6rem" }} />
                  <Skeleton className="flex-1 h-1.5 rounded-full" />
                  <Skeleton className="h-3" style={{ width: "1.5rem" }} />
                </div>
              ))}
            </div>
          ) : byTitleSorted.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>No customers yet</p>
          ) : (
            <div className="space-y-1.5">
              {byTitleSorted.map((d) => (
                <div key={d.title} className="flex items-center gap-2">
                  <p className="text-xs w-24 truncate" style={{ color: "var(--color-text-muted)" }}>{customerTypeLabel(d.title)}</p>
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--color-bg)" }}>
                    <div className="h-full rounded-full" style={{ background: customerTypeColor(d.title), width: `${total > 0 ? (d.count / total) * 100 : 0}%` }} />
                  </div>
                  <p className="text-xs w-6 text-right" style={{ color: "var(--color-text-muted)" }}>{d.count}</p>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Start Scan Banner — shown when a search narrows to exactly one customer */}
      {hasSearch && total === 1 && customers[0] && (
        <div className="rounded-xl p-4 mb-4 flex items-center justify-between"
          style={{ background: "rgba(114,108,90,0.08)", border: "1.5px solid var(--color-primary)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--color-primary)" }}>
              <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" /><path d="M3 17h4v4H3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Customer found: {customers[0].fullName}</p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {customers[0].customerCode} · {customerTypeLabel(customers[0].title)} · {customers[0].company}
              </p>
            </div>
          </div>
          <button onClick={() => handleStartScan(customers[0])} disabled={startingSession === customers[0].id}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60" style={{ background: "var(--color-primary)" }}>
            {startingSession === customers[0].id ? <Spinner size="sm" color="#fff" /> : (
              <svg aria-hidden="true" width="14" height="14" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" /><path d="M3 17h4v4H3z" />
              </svg>
            )}
            {startingSession === customers[0].id ? "Starting..." : "Start Surface Scan"}
          </button>
        </div>
      )}

      <DataTable
        tableId="customers"
        columns={columns}
        data={customers}
        loading={loading}
        error={loadError}
        onRetry={fetchCustomers}
        errorMessage="Could not load customers. Please try again."
        emptyMessage="No customers found"
        sorting={sorting}
        onSortingChange={setSorting}
        globalFilter={globalFilter}
        onGlobalFilterChange={setSearchInput}
        columnFilters={columnFilters}
        onColumnFiltersChange={setColumnFilters}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        getRowId={(c) => c.id}
        toolbar={
          <>
            {/* Search — fills the row on mobile, fixed width on larger screens */}
            <div className="w-full sm:w-56 flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
              <svg width="14" height="14" fill="none" stroke="var(--color-icon-muted)" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search customers"
                className="outline-none text-sm bg-transparent w-full" style={{ color: "var(--color-text)" }} />
            </div>
            {/* Type — a real column filter on the "title" column */}
            <div className="relative w-full sm:w-auto">
              <select aria-label="Filter by type" value={filterTitle}
                onChange={(e) => setColumnFilters(e.target.value === "all" ? [] : [{ id: "title", value: e.target.value }])}
                className="appearance-none outline-none text-sm pl-3 pr-8 py-1.5 rounded-lg cursor-pointer w-full sm:w-auto"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)", minWidth: "120px" }}>
                <option value="all">All Types</option>
                {TITLE_OPTIONS.map((t) => <option key={t} value={t}>{customerTypeLabel(t)}</option>)}
              </select>
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                <svg width="12" height="12" fill="none" stroke="var(--color-icon-muted)" strokeWidth="2" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
              </div>
            </div>
          </>
        }
      />
    </div>
  );
}
