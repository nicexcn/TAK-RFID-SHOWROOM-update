"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toCsv } from "@/lib/csv";

const TITLE_OPTIONS = ["Architect", "Interior", "Turnkey", "Contractor", "Homeowner", "Other"];
const titleColors: Record<string, string> = {
  Architect: "#726c5a", Interior: "#9f886c", Turnkey: "#4a6fa5",
  Contractor: "#4c4847", Homeowner: "#4a7c59", Other: "#888",
};

interface Customer {
  id: string; customerCode: string; fullName: string; title: string;
  company: string; phone: string; email: string; knowChannel: string[]; createdAt: string;
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTitle, setFilterTitle] = useState("all");
  const [startingSession, setStartingSession] = useState<string | null>(null);

  useEffect(() => { fetchCustomers(); }, [search, filterTitle]);

  async function fetchCustomers() {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterTitle !== "all") params.set("title", filterTitle);
    const res = await fetch(`/api/customers?${params}`);
    const data = await res.json();
    setCustomers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function handleExport() {
    const res = await fetch("/api/customers");
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) { alert("ไม่มีข้อมูล"); return; }
    const rows = [
      ["Code","Full Name","Title","Company","Phone","Email","Channels","Registered"],
      ...data.map((c: Customer) => [c.customerCode, c.fullName, c.title, c.company, c.phone, c.email, c.knowChannel.join(";"), new Date(c.createdAt).toLocaleDateString("th-TH")]),
    ];
    const csv = toCsv(rows);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `customers_${new Date().toISOString().slice(0,10)}.csv`; a.click();
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
        alert("ไม่สามารถเริ่ม session ได้");
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Customer Management</h1>
          <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Customer Management" }]} />
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847" }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
          <Link href="/admin/customers/add" className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: "#726c5a" }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Customer
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 items-start">
        {/* Total Members */}
        <div className="p-5 rounded-xl" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
          <p className="text-xs mb-2" style={{ color: "#9f886c" }}>Total Members</p>
          <p className="text-3xl font-semibold" style={{ color: "#4c4847" }}>{customers.length}</p>
        </div>
        {/* Type of Customers — occupation breakdown (matches the dashboard widget) */}
        <div className="p-5 rounded-xl lg:col-span-2" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
          <p className="text-sm mb-1" style={{ color: "#9f886c" }}>Type of Customers</p>
          {byTitle.length === 0 ? (
            <p className="text-3xl font-semibold" style={{ color: "#4c4847" }}>-</p>
          ) : (
            <>
              <p className="text-2xl font-semibold" style={{ color: "#4c4847" }}>{byTitle[0].title}</p>
              <p className="text-xs mb-3" style={{ color: "#cdc3ad" }}>Top type · {byTitle[0].count}</p>
              <div className="space-y-1.5">
                {byTitle.map((d) => (
                  <div key={d.title} className="flex items-center gap-2">
                    <p className="text-xs w-20 truncate" style={{ color: "#9f886c" }}>{d.title}</p>
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: "#f5f2ee" }}>
                      <div className="h-full rounded-full" style={{ background: titleColors[d.title] || "#888", width: `${customers.length > 0 ? (d.count / customers.length) * 100 : 0}%` }} />
                    </div>
                    <p className="text-xs w-6 text-right" style={{ color: "#9f886c" }}>{d.count}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl flex-1 max-w-sm" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
          <svg width="14" height="14" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Global Search"
            className="outline-none text-sm w-full" style={{ background: "transparent", color: "#4c4847" }} />
        </div>
        <div className="relative">
          <select value={filterTitle} onChange={(e) => setFilterTitle(e.target.value)}
            className="appearance-none outline-none text-sm pl-3 pr-8 py-2 rounded-xl cursor-pointer"
            style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847", minWidth: "120px" }}>
            <option value="all">All Types</option>
            {TITLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
            <svg width="12" height="12" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>
      </div>

      {/* Start Scan Banner — แสดงเมื่อค้นหาและเจอลูกค้า 1 คน */}
      {hasSearch && customers.length === 1 && (
        <div className="rounded-xl p-4 mb-4 flex items-center justify-between"
          style={{ background: "rgba(114,108,90,0.08)", border: "1.5px solid #726c5a" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "#726c5a" }}>
              <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><path d="M3 17h4v4H3z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#4c4847" }}>
                พบลูกค้า: {customers[0].fullName}
              </p>
              <p className="text-xs" style={{ color: "#9f886c" }}>
                {customers[0].customerCode} · {customers[0].title} · {customers[0].company}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleStartScan(customers[0])}
            disabled={startingSession === customers[0].id}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
            style={{ background: "#726c5a" }}>
            {startingSession === customers[0].id ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><path d="M3 17h4v4H3z"/>
              </svg>
            )}
            {startingSession === customers[0].id ? "กำลังเริ่ม..." : "เริ่ม Surface Scan"}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-x-auto" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
        <table className="w-full text-sm min-w-max">
          <thead>
            <tr style={{ borderBottom: "1px solid #e6e5d8", background: "#f5f2ee" }}>
              {["Code","Name","Type","Company","Phone","Email","Channels","Registered",""].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide" style={{ color: "#9f886c" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-16"><div className="w-6 h-6 rounded-full border-2 animate-spin mx-auto" style={{ borderColor: "#726c5a", borderTopColor: "transparent" }} /></td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-16 text-sm" style={{ color: "#cdc3ad" }}>No customers found</td></tr>
            ) : customers.map((c, i) => (
              <tr key={c.id} style={{ borderBottom: i < customers.length - 1 ? "1px solid #f5f2ee" : "none" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#faf9f7")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <td className="px-4 py-3"><code className="text-xs" style={{ color: "#9f886c" }}>{c.customerCode}</code></td>
                <td className="px-4 py-3 font-medium" style={{ color: "#4c4847" }}>{c.fullName}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: `${titleColors[c.title] || "#888"}20`, color: titleColors[c.title] || "#888" }}>
                    {c.title}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "#4c4847" }}>{c.company}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#726c5a" }}>{c.phone}</td>
                <td className="px-4 py-3 text-xs" style={{ color: "#726c5a" }}>{c.email}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.knowChannel.slice(0,2).map((ch) => (
                      <span key={ch} className="px-1.5 py-0.5 rounded text-xs" style={{ background: "#f5f2ee", color: "#726c5a" }}>{ch}</span>
                    ))}
                    {c.knowChannel.length > 2 && <span className="text-xs" style={{ color: "#9f886c" }}>+{c.knowChannel.length - 2}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "#9f886c" }}>{new Date(c.createdAt).toLocaleDateString("th-TH")}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/customers/${c.id}`}
                      className="px-3 py-1 rounded-lg text-xs" style={{ background: "#f5f2ee", color: "#726c5a" }}>View</Link>
                    <button
                      onClick={() => handleStartScan(c)}
                      disabled={startingSession === c.id}
                      title="เริ่ม Surface Scan"
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-50"
                      style={{ background: "#726c5a" }}>
                      {startingSession === c.id ? (
                        <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24">
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