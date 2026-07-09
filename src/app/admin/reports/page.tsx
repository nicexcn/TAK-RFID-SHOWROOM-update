"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useState, useEffect, useCallback } from "react";
import { toCsv } from "@/lib/csv";

// #4 Report: product activity by period + search by customer code / Project / Sale,
// with the "all scanned" and "taken home" lists (image1) and interest breakdowns.

interface ProdLite { id: string; name: string; brand: string | null; category: string | null; materialType: string | null; productCode: string | null; }
interface ProductRow { product: ProdLite; scanCount: number; takenQty: number; }
interface Report {
  period: { from: string; to: string; label: string; key: string };
  summary: { visits: number; customers: number; totalScans: number; totalTaken: number; uniqueProducts: number; firstTime: number; returning: number };
  scannedProducts: ProductRow[];
  takenHomeProducts: ProductRow[];
  byBrand: { name: string; count: number }[];
  byCategory: { name: string; count: number }[];
  bySource: { name: string; count: number }[];
  byType: { name: string; count: number }[];
  satisfaction: { overall: number | null; service: number | null; responses: number };
}

const PERIODS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
] as const;

export default function ReportsPage() {
  const [period, setPeriod] = useState<string>("monthly");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState(""); // applied search term
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/reports?${params}`);
      setData(res.ok ? await res.json() : null);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [period, query]);

  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [
      [`Report — ${PERIODS.find((p) => p.key === data.period.key)?.label || data.period.label}${query ? ` — "${query}"` : ""}`],
      [`${new Date(data.period.from).toLocaleDateString("en-GB")} – ${new Date(data.period.to).toLocaleDateString("en-GB")}`],
      [],
      ["Visits", data.summary.visits], ["Customers", data.summary.customers],
      ["Items scanned", data.summary.totalScans], ["Pieces taken home", data.summary.totalTaken], [],
      ["All scanned products"],
      ["Product", "Code", "Brand", "Category", "Scans", "Taken home"],
      ...data.scannedProducts.map((r) => [r.product.name, r.product.productCode || "", r.product.brand || "", r.product.category || "", r.scanCount, r.takenQty]),
      [],
      ["Taken-home products"],
      ["Product", "Code", "Brand", "Taken home"],
      ...data.takenHomeProducts.map((r) => [r.product.name, r.product.productCode || "", r.product.brand || "", r.takenQty]),
    ];
    const csv = toCsv(rows);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `report_${data.period.key}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  // #11: ERP stock-cut export — one row per taken-home line (date + product code + qty + customer),
  // so ERP can cut stock. Fetches the per-takeaway detail (detail=takeaways) for the current period/search.
  async function exportErp() {
    try {
      const params = new URLSearchParams({ period, detail: "takeaways" });
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/reports?${params}`);
      if (!res.ok) { alert("Export failed — please try again."); return; }
      const d = await res.json();
      const takeaways = (d.takeaways || []) as { date: string; customerCode: string; customer: string; company: string; productCode: string; productName: string; brand: string; category: string; qty: number; sale: string; project: string }[];
      const rows: (string | number)[][] = [
        ["Date", "Customer Code", "Customer", "Company", "Product Code", "Product Name", "Brand", "Category", "Qty Taken", "Sale", "Project"],
        ...takeaways.map((t) => [
          t.date, t.customerCode, t.customer, t.company, // t.date is already a Bangkok YYYY-MM-DD string
          t.productCode, t.productName, t.brand, t.category, t.qty, t.sale, t.project,
        ]),
      ];
      const csv = toCsv(rows);
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `erp_takeaways_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch { alert("Export failed — please try again."); }
  }

  const maxBrand = Math.max(1, ...(data?.byBrand || []).map((b) => b.count));
  const maxCat = Math.max(1, ...(data?.byCategory || []).map((b) => b.count));
  const maxSource = Math.max(1, ...(data?.bySource || []).map((b) => b.count));
  const maxType = Math.max(1, ...(data?.byType || []).map((b) => b.count));

  const card = (label: string, value: number, hint?: string) => (
    <div className="p-4 rounded-xl" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
      <p className="text-xs mb-1" style={{ color: "#9f886c" }}>{label}</p>
      <p className="text-3xl font-semibold" style={{ color: "#4c4847" }}>{value}</p>
      {hint && <p className="text-[11px] mt-0.5" style={{ color: "#cdc3ad" }}>{hint}</p>}
    </div>
  );

  const bars = (title: string, rows: { name: string; count: number }[], max: number, color: string) => (
    <div className="p-5 rounded-xl" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
      <p className="text-sm font-semibold mb-3" style={{ color: "#4c4847" }}>{title}</p>
      {rows.length === 0 ? <p className="text-sm" style={{ color: "#cdc3ad" }}>No data</p> : (
        <div className="space-y-1.5">
          {rows.slice(0, 8).map((b) => (
            <div key={b.name} className="flex items-center gap-2">
              <p className="text-xs w-28 truncate" style={{ color: "#9f886c" }}>{b.name}</p>
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "#f5f2ee" }}>
                <div className="h-full rounded-full" style={{ background: color, width: `${(b.count / max) * 100}%` }} />
              </div>
              <p className="text-xs w-6 text-right" style={{ color: "#9f886c" }}>{b.count}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Reports</h1>
          <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Reports" }]} />
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} disabled={!data}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847" }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Export CSV
          </button>
          <button onClick={exportErp} disabled={!data} title="Per-takeaway lines for ERP stock-cut"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "#726c5a" }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Export for ERP
          </button>
        </div>
      </div>

      {/* Period tabs + search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex gap-1.5 flex-wrap">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className="px-3.5 py-2 rounded-xl text-sm"
              style={{ background: period === p.key ? "#726c5a" : "#fff", color: period === p.key ? "#fff" : "#9f886c", border: "1px solid #e6e5d8" }}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl flex-1 max-w-sm" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
          <svg width="14" height="14" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setQuery(q)}
            placeholder="Search customer code / Project / Sale"
            className="outline-none text-sm w-full" style={{ background: "transparent", color: "#4c4847" }} />
          {query && <button onClick={() => { setQ(""); setQuery(""); }} className="text-xs" style={{ color: "#9f886c" }}>✕</button>}
        </div>
        <button onClick={() => setQuery(q)} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: "#726c5a" }}>Search</button>
      </div>

      {loading ? (
        <p className="text-sm py-16 text-center" style={{ color: "#cdc3ad" }}>Loading…</p>
      ) : !data ? (
        <p className="text-sm py-16 text-center" style={{ color: "#cdc3ad" }}>Failed to load report</p>
      ) : (
        <div className="space-y-6">
          <p className="text-xs" style={{ color: "#9f886c" }}>
            {new Date(data.period.from).toLocaleDateString("en-GB")} – {new Date(data.period.to).toLocaleDateString("en-GB")}
            {query && <> · search &quot;{query}&quot;</>}
          </p>

          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {card("Visits", data.summary.visits)}
            {card("Customers", data.summary.customers)}
            {card("Items scanned", data.summary.totalScans, `${data.summary.uniqueProducts} unique`)}
            {card("Taken home", data.summary.totalTaken, "pcs")}
          </div>

          {/* Interest breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {bars("Brands scanned", data.byBrand, maxBrand, "#726c5a")}
            {bars("Categories", data.byCategory, maxCat, "#9f886c")}
          </div>

          {/* #4 (Excel): customer source + visitor types */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {bars("Customer source", data.bySource, maxSource, "#4a6fa5")}
            {bars("Visitor types", data.byType, maxType, "#4a7c59")}
          </div>

          {/* #4 (Excel): first-time vs returning + satisfaction summary */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {card("First-time", data.summary.firstTime, "visitors this period")}
            {card("Returning", data.summary.returning, "visited before")}
            <div className="p-4 rounded-xl" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
              <p className="text-xs mb-1" style={{ color: "#9f886c" }}>Satisfaction (avg / 5)</p>
              <div className="flex gap-5">
                <div><p className="text-2xl font-semibold" style={{ color: "#726c5a" }}>{data.satisfaction.overall ?? "—"}</p><p className="text-[11px]" style={{ color: "#cdc3ad" }}>overall</p></div>
                <div><p className="text-2xl font-semibold" style={{ color: "#726c5a" }}>{data.satisfaction.service ?? "—"}</p><p className="text-[11px]" style={{ color: "#cdc3ad" }}>service</p></div>
              </div>
              <p className="text-[11px] mt-0.5" style={{ color: "#cdc3ad" }}>{data.satisfaction.responses} responses</p>
            </div>
          </div>

          {/* Two lists: all scanned + taken home */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {productTable("All scanned products", data.scannedProducts, "scan")}
            {productTable("Taken-home products", data.takenHomeProducts, "taken")}
          </div>
        </div>
      )}
    </div>
  );
}

function productTable(title: string, rows: ProductRow[], mode: "scan" | "taken") {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #f0eee6" }}>
        <p className="text-sm font-semibold" style={{ color: "#4c4847" }}>{title}</p>
        <span className="text-xs" style={{ color: "#9f886c" }}>{rows.length} items</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm py-10 text-center" style={{ color: "#cdc3ad" }}>No data in this period</p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "#9f886c" }}>
                <th className="text-left font-normal px-5 py-2 text-xs">Product</th>
                <th className="text-right font-normal px-3 py-2 text-xs whitespace-nowrap">{mode === "scan" ? "Scans" : "Taken"}</th>
                {mode === "scan" && <th className="text-right font-normal px-5 py-2 text-xs whitespace-nowrap">Taken</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product.id} style={{ borderTop: "1px solid #f5f2ee" }}>
                  <td className="px-5 py-2.5">
                    <p style={{ color: "#4c4847" }} className="truncate">{r.product.name}</p>
                    <p className="text-[11px] truncate" style={{ color: "#9f886c" }}>{[r.product.productCode, r.product.brand, r.product.category].filter(Boolean).join(" · ") || "—"}</p>
                  </td>
                  <td className="text-right px-3 py-2.5 tabular-nums" style={{ color: "#4c4847" }}>{mode === "scan" ? r.scanCount : r.takenQty}</td>
                  {mode === "scan" && <td className="text-right px-5 py-2.5 tabular-nums" style={{ color: r.takenQty > 0 ? "#4a7c59" : "#cdc3ad" }}>{r.takenQty}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
