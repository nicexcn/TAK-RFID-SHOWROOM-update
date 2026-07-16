"use client";
import { PageHeader } from "@/components/PageHeader";
import { Spinner } from "@/components/Spinner";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toCsv } from "@/lib/csv";
import { CUSTOMER_TYPES, customerTypeLabel, customerTypeColor } from "@/lib/customerTypes";
import { formatDate } from "@/lib/formatDate";
import { toast } from "sonner";

const errorToast = { style: { background: "var(--color-danger-soft)", color: "var(--color-surface)", border: "none", borderRadius: "0.75rem" } };

const TITLE_OPTIONS = CUSTOMER_TYPES.map((t) => t.value);

interface Customer {
  id: string; customerCode: string; fullName: string; title: string;
  company: string; phone: string; email: string; knowChannel: string[]; createdAt: string; salesPerson?: string | null; source?: string | null;
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTitle, setFilterTitle] = useState("all");
  const [startingSession, setStartingSession] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [role, setRole] = useState("");
  // Item 6: ONLY Super Admin may export the customer database. Admin (Showroom Manager),
  // management (Sales Director) and the basic Presenter all have "cannot export the full
  // customer database" / "cannot export data" in the role matrix.
  const canExport = role === "super_admin";

  useEffect(() => { fetchCustomers(); }, [search, filterTitle]);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.role) setRole(d.role); }); }, []);

  async function fetchCustomers() {
    setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterTitle !== "all") params.set("title", filterTitle);
    try {
      const res = await fetch(`/api/customers?${params}`);
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      setLoadError(true);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
    const res = await fetch("/api/customers");
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) { toast("No data to export", errorToast); return; }
    const rows = [
      ["Code","Full Name","Title","Company","Phone","Email","Channels","Source","Sales","Registered"],
      ...data.map((c: Customer) => [c.customerCode, c.fullName, c.title, c.company, c.phone, c.email, c.knowChannel.join(";"), c.source ?? "", c.salesPerson ?? "", formatDate(c.createdAt)]),
    ];
    const csv = toCsv(rows);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `customers_${new Date().toISOString().slice(0,10)}.csv`; a.click();
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

  const hasSearch = search.trim().length > 0 || filterTitle !== "all";

  // Occupation breakdown for the "Type of Customers" card (like the dashboard widget).
  const byTitle = TITLE_OPTIONS
    .map((t) => ({ title: t, count: customers.filter((c) => c.title === t).length }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);

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
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
                  </svg>
                  Exporting…
                </>
              ) : (
                <>
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Export CSV
                </>
              )}
            </button>
          )}
          <Link href="/admin/customers/add" className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: "var(--color-primary)" }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Customer
          </Link>
        </>}
      />


      {/* Stats — total + occupation breakdown in one card (like the dashboard widget) */}
      <div className="p-5 rounded-xl mb-6 flex flex-col sm:flex-row gap-5" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        {/* Total */}
        <div className="flex-shrink-0 sm:w-44 sm:pr-5 sm:border-r" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Total Members</p>
          <p className="text-4xl font-semibold" style={{ color: "var(--color-text)" }}>{customers.length}</p>
        </div>
        {/* Type of Customers breakdown */}
        <div className="flex-1 min-w-0">
          <p className="text-sm mb-2" style={{ color: "var(--color-text-muted)" }}>Type of Customers</p>
          {byTitle.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>No customers yet</p>
          ) : (
            <div className="space-y-1.5">
              {byTitle.map((d) => (
                <div key={d.title} className="flex items-center gap-2">
                  <p className="text-xs w-24 truncate" style={{ color: "var(--color-text-muted)" }}>{customerTypeLabel(d.title)}</p>
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--color-bg)" }}>
                    <div className="h-full rounded-full" style={{ background: customerTypeColor(d.title), width: `${customers.length > 0 ? (d.count / customers.length) * 100 : 0}%` }} />
                  </div>
                  <p className="text-xs w-6 text-right" style={{ color: "var(--color-text-muted)" }}>{d.count}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl flex-1 max-w-sm" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <svg width="14" height="14" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers"
            className="outline-none text-sm w-full" style={{ background: "transparent", color: "var(--color-text)" }} />
        </div>
        <div className="relative">
          <select aria-label="Filter by type" value={filterTitle} onChange={(e) => setFilterTitle(e.target.value)}
            className="appearance-none outline-none text-sm pl-3 pr-8 py-2 rounded-xl cursor-pointer"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)", minWidth: "120px" }}>
            <option value="all">All Types</option>
            {TITLE_OPTIONS.map((t) => <option key={t} value={t}>{customerTypeLabel(t)}</option>)}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
            <svg width="12" height="12" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>
      </div>

      {/* Start Scan Banner — แสดงเมื่อค้นหาและเจอลูกค้า 1 คน */}
      {hasSearch && customers.length === 1 && (
        <div className="rounded-xl p-4 mb-4 flex items-center justify-between"
          style={{ background: "rgba(114,108,90,0.08)", border: "1.5px solid var(--color-primary)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--color-primary)" }}>
              <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><path d="M3 17h4v4H3z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                Customer found: {customers[0].fullName}
              </p>
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                {customers[0].customerCode} · {customerTypeLabel(customers[0].title)} · {customers[0].company}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleStartScan(customers[0])}
            disabled={startingSession === customers[0].id}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ background: "var(--color-primary)" }}>
            {startingSession === customers[0].id ? (
              <Spinner size="sm" color="#fff" />
            ) : (
              <svg aria-hidden="true" width="14" height="14" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><path d="M3 17h4v4H3z"/>
              </svg>
            )}
            {startingSession === customers[0].id ? "Starting..." : "Start Surface Scan"}
          </button>
        </div>
      )}

      {/* Load error banner */}
      {loadError && (
        <div className="rounded-xl p-4 mb-4 flex items-center justify-between gap-3"
          style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)" }}>
          <p className="text-sm" style={{ color: "var(--color-danger-soft)" }}>Could not load customers. Please try again.</p>
          <button onClick={fetchCustomers}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-danger-border)", color: "var(--color-danger-soft)" }}>
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-x-auto" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <table className="w-full text-sm min-w-max">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
              {["Code","Name","Type","Company","Phone","Email","Channels","Registered",""].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{h || <span className="sr-only">Actions</span>}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-16"><Spinner size="lg" className="mx-auto" /></td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-16 text-sm" style={{ color: "var(--color-text-subtle)" }}>No customers found</td></tr>
            ) : customers.map((c, i) => (
              <tr key={c.id} style={{ borderBottom: i < customers.length - 1 ? "1px solid var(--color-bg)" : "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <td className="px-4 py-3"><code className="text-xs" style={{ color: "var(--color-text-muted)" }}>{c.customerCode}</code></td>
                <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text)" }}>{c.fullName}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: `${customerTypeColor(c.title)}20`, color: customerTypeColor(c.title) }}>
                    {customerTypeLabel(c.title)}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--color-text)" }}>{c.company}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>{c.phone}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>{c.email}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.knowChannel.slice(0,2).map((ch) => (
                      <span key={ch} className="px-1.5 py-0.5 rounded text-xs" style={{ background: "var(--color-bg)", color: "var(--color-text-muted)" }}>{ch}</span>
                    ))}
                    {c.knowChannel.length > 2 && <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>+{c.knowChannel.length - 2}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>{formatDate(c.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/customers/${c.id}`}
                      className="px-3 py-1 rounded-lg text-xs" style={{ background: "var(--color-bg)", color: "var(--color-text-muted)" }}>View</Link>
                    <button
                      onClick={() => handleStartScan(c)}
                      disabled={startingSession === c.id}
                      title="Start Surface Scan"
                      aria-label={`Start Surface Scan for ${c.fullName}`}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-50"
                      style={{ background: "var(--color-primary)" }}>
                      {startingSession === c.id ? (
                        <Spinner size="xs" color="#fff" />
                      ) : (
                        <svg aria-hidden="true" width="12" height="12" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                          <rect x="14" y="14" width="7" height="7"/><path d="M3 17h4v4H3z"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}