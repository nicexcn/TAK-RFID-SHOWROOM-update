"use client";
import { PageHeader } from "@/components/PageHeader";

import { useState, useEffect, useCallback } from "react";
import { toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/formatDate";
import { SkeletonCard } from "@/components/Skeleton";
import { toast } from "sonner";

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
  const [exportingErp, setExportingErp] = useState(false);
  const [exportingVisits, setExportingVisits] = useState(false);
  // TAK 28/8 (item J): preset period tabs OR a custom calendar range (the API already
  // accepts from/to). Both exports use the same window.
  const [rangeMode, setRangeMode] = useState<"preset" | "custom">("preset");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (appliedRange) { params.set("from", appliedRange.from); params.set("to", appliedRange.to); }
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/reports?${params}`);
      setData(res.ok ? await res.json() : null);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [period, query, appliedRange]);

  useEffect(() => { load(); }, [load]);

  // Shared window params for every export (custom range wins over the preset period).
  function windowParams(extra: Record<string, string> = {}) {
    const params = new URLSearchParams({ period, ...extra });
    if (appliedRange) { params.set("from", appliedRange.from); params.set("to", appliedRange.to); }
    if (query.trim()) params.set("q", query.trim());
    return params;
  }

  function applyRange() {
    if (!customFrom || !customTo) return;
    if (customFrom > customTo) { toast("Invalid range — 'from' is after 'to'.", { style: { background: "var(--color-danger-soft)", color: "var(--color-surface)", border: "none", borderRadius: "0.75rem" } }); return; }
    setAppliedRange({ from: customFrom, to: customTo });
  }

  function exportCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [
      [`Report — ${appliedRange ? "Custom range" : PERIODS.find((p) => p.key === data.period.key)?.label || data.period.label}${query ? ` — "${query}"` : ""}`],
      [`${formatDate(data.period.from)} – ${formatDate(data.period.to)}`],
      [],
      ["Visits", data.summary.visits], ["Customers", data.summary.customers],
      ["Items scanned", data.summary.totalScans], ["Pieces taken home", data.summary.totalTaken], [],
      ["All scanned products"],
      ["Product", "Code", "Brand", "Category", "Scans", "Taken home (pcs)"],
      ...data.scannedProducts.map((r) => [r.product.name, r.product.productCode || "", r.product.brand || "", r.product.category || "", r.scanCount, r.takenQty]),
      [],
      ["Taken-home products"],
      ["Product", "Code", "Brand", "Quantity (pcs)"], // TAK 28/8 (K): piece counts, not just counts
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
    if (exportingErp) return;
    setExportingErp(true);
    try {
      const res = await fetch(`/api/reports?${windowParams({ detail: "takeaways" })}`);
      if (!res.ok) { toast("Export failed — please try again.", { style: { background: "var(--color-danger-soft)", color: "var(--color-surface)", border: "none", borderRadius: "0.75rem" } }); return; }
      const d = await res.json();
      const takeaways = (d.takeaways || []) as { date: string; docNo: string; customerCode: string; customer: string; company: string; contact: string; phone: string; zone: string; project: string; productCode: string; productName: string; brand: string; category: string; qty: number; sale: string; saleCode: string }[];
      // Column set follows the TAK ERP template (slide 27). Posting Date as dd/mm/yy.
      const posting = (iso: string) => {
        const [y, m, d2] = iso.split("-");
        return `${d2}/${m}/${y.slice(2)}`;
      };
      const rows: (string | number)[][] = [
        ["Posting Date", "Document No.", "Item No.", "Quantity", "Customer Name", "Contact Person", "Project Name", "Sales Name", "Sales Dimension"],
        ...takeaways.map((t) => [
          posting(t.date), t.docNo, // t.date is a Bangkok YYYY-MM-DD string
          t.productCode, t.qty, t.customer, [t.contact, t.phone].filter(Boolean).join(" "),
          t.project, t.sale, t.saleCode,
        ]),
      ];
      const csv = toCsv(rows);
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `erp_takeaways_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch { toast("Export failed — please try again.", { style: { background: "var(--color-danger-soft)", color: "var(--color-surface)", border: "none", borderRadius: "0.75rem" } }); }
    finally { setExportingErp(false); }
  }

  // TAK 28/8 (item I): visits export — ONE ROW PER VISIT (session), including visits with
  // nothing taken, with the staff-entered topics (Interest / SO No. / Status), item codes
  // taken home, remark, and the visit's project.
  async function exportVisits() {
    if (exportingVisits) return;
    setExportingVisits(true);
    try {
      const res = await fetch(`/api/reports?${windowParams({ detail: "visits" })}`);
      if (!res.ok) { toast("Export failed — please try again.", { style: { background: "var(--color-danger-soft)", color: "var(--color-surface)", border: "none", borderRadius: "0.75rem" } }); return; }
      const d = await res.json();
      const visits = (d.visits || []) as { date: string; customerCode: string; customer: string; company: string; contact: string; zone: string; project: string; interest: string; soNumber: string; status: string; productsTaken: string; totalQty: number; remark: string; sale: string }[];
      const rows: (string | number)[][] = [
        ["Posting Date", "Customer Code", "Customer", "Company", "Contact", "Zone", "Project", "Interest", "SO No.", "Status", "Items Taken", "Total Qty", "Remark", "Sales"],
        ...visits.map((v) => [
          v.date.split("-").reverse().join("/"), // YYYY-MM-DD → dd/mm/yy, same convention as ERP
          v.customerCode, v.customer, v.company, v.contact, v.zone, v.project,
          v.interest, v.soNumber, v.status, v.productsTaken, v.totalQty, v.remark, v.sale,
        ]),
      ];
      const csv = toCsv(rows);
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `visits_${appliedRange ? "custom" : period}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch { toast("Export failed — please try again.", { style: { background: "var(--color-danger-soft)", color: "var(--color-surface)", border: "none", borderRadius: "0.75rem" } }); }
    finally { setExportingVisits(false); }
  }

  const maxBrand = Math.max(1, ...(data?.byBrand || []).map((b) => b.count));
  const maxCat = Math.max(1, ...(data?.byCategory || []).map((b) => b.count));
  const maxSource = Math.max(1, ...(data?.bySource || []).map((b) => b.count));
  const maxType = Math.max(1, ...(data?.byType || []).map((b) => b.count));

  const card = (label: string, value: number, hint?: string) => (
    <div className="p-4 rounded-xl" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <p className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      <p className="text-3xl font-semibold" style={{ color: "var(--color-text)" }}>{value}</p>
      {hint && <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-subtle)" }}>{hint}</p>}
    </div>
  );

  // Named section header for the three customer report groups (English + Thai subtitle to match the app).
  const sectionHeader = (en: string, th: string) => (
    <div className="pt-2">
      <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>{en}</h2>
      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{th}</p>
    </div>
  );

  const bars = (title: string, rows: { name: string; count: number }[], max: number, color: string) => (
    <div className="p-5 rounded-xl" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <p className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>{title}</p>
      {rows.length === 0 ? <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>No data</p> : (
        <div className="space-y-1.5">
          {rows.slice(0, 8).map((b) => (
            <div key={b.name} className="flex items-center gap-2">
              <p className="text-xs w-28 truncate" style={{ color: "var(--color-text-muted)" }}>{b.name}</p>
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--color-bg)" }}>
                <div className="h-full rounded-full" style={{ background: color, width: `${(b.count / max) * 100}%` }} />
              </div>
              <p className="text-xs w-6 text-right" style={{ color: "var(--color-text-muted)" }}>{b.count}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Reports"
        crumbs={[{ label: "Home", href: "/admin" }, { label: "Reports" }]}
        actions={
          <>
            <button onClick={exportCsv} disabled={!data}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              Export CSV
            </button>
            <button onClick={exportErp} disabled={!data || exportingErp} title="Per-takeaway lines for ERP stock-cut"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 disabled:cursor-wait"
              style={{ background: "var(--color-primary)" }}>
              {exportingErp ? (
                <svg className="animate-spin" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
              ) : (
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              )}
              {exportingErp ? "Exporting…" : "Export for ERP"}
            </button>
            <button onClick={exportVisits} disabled={!data || exportingVisits} title="One row per visit, incl. Interest / SO No. / Status"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 disabled:cursor-wait"
              style={{ background: "var(--color-primary)" }}>
              {exportingVisits ? (
                <svg className="animate-spin" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
              ) : (
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              )}
              {exportingVisits ? "Exporting…" : "Export visits"}
            </button>
          </>
        }
      />

      {/* Period tabs + custom range (TAK 28/8 item J) + search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex gap-1.5 flex-wrap">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => { setPeriod(p.key); setAppliedRange(null); }}
              className="px-3.5 py-2 rounded-xl text-sm"
              style={{ background: rangeMode === "preset" && period === p.key ? "var(--color-primary)" : "var(--color-surface)", color: rangeMode === "preset" && period === p.key ? "var(--color-surface)" : "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
              {p.label}
            </button>
          ))}
          {/* TAK 28/8 (J): custom calendar range — mirrors the Dashboard's range toggle. */}
          {rangeMode === "custom" ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>
              <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-transparent text-sm outline-none" style={{ colorScheme: "dark light" }} aria-label="From date" />
              <span className="text-xs">–</span>
              <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)}
                className="bg-transparent text-sm outline-none" style={{ colorScheme: "dark light" }} aria-label="To date" />
              <button onClick={applyRange} disabled={!customFrom || !customTo}
                className="px-2.5 py-1 rounded-lg text-xs font-medium disabled:opacity-50"
                style={{ background: "var(--color-surface)", color: "var(--color-text)" }}>Apply</button>
              <button onClick={() => { setRangeMode("preset"); setAppliedRange(null); }}
                className="text-xs underline" aria-label="Close custom range">✕</button>
            </div>
          ) : (
            <button onClick={() => setRangeMode("custom")} title="Pick a custom date range"
              className="px-3.5 py-2 rounded-xl text-sm" style={{ background: "var(--color-surface)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
              📅 Custom
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl flex-1 max-w-sm" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <svg width="14" height="14" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setQuery(q)}
            placeholder="Search customer code / Project / Sale"
            className="outline-none text-sm w-full" style={{ background: "transparent", color: "var(--color-text)" }} />
          {query && <button onClick={() => { setQ(""); setQuery(""); }} className="text-xs" style={{ color: "var(--color-text-muted)" }}>✕</button>}
        </div>
        <button onClick={() => setQuery(q)} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: "var(--color-primary)" }}>Search</button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} lines={4} />)}
        </div>
      ) : !data ? (
        <p className="text-sm py-16 text-center" style={{ color: "var(--color-text-subtle)" }}>Failed to load report</p>
      ) : (
        <div className="space-y-6">
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {formatDate(data.period.from)} – {formatDate(data.period.to)}
            {appliedRange && <> · custom range</>}
            {query && <> · search &quot;{query}&quot;</>}
          </p>

          {/* ── A. Visitor & Customer Insights ─────────────────────────────── */}
          {sectionHeader("Visitor & Customer Insights", "ข้อมูลผู้เข้าชมและลูกค้า")}

          {/* Total visitors + first-time vs returning */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {card("Total visitors", data.summary.visits, `${data.summary.customers} customers`)}
            {card("Customers", data.summary.customers)}
            {card("First-time", data.summary.firstTime, "visitors this period")}
            {card("Returning", data.summary.returning, "visited before")}
          </div>

          {/* By source (discovery channel) + by customer type + satisfaction */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {bars("Customer source", data.bySource, maxSource, "#4a6fa5")}
            {bars("Visitor types", data.byType, maxType, "#4a7c59")}
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="p-4 rounded-xl" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <p className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Satisfaction (avg / 5)</p>
              <div className="flex gap-5">
                <div><p className="text-2xl font-semibold" style={{ color: "var(--color-text-muted)" }}>{data.satisfaction.overall ?? "—"}</p><p className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>overall</p></div>
                <div><p className="text-2xl font-semibold" style={{ color: "var(--color-text-muted)" }}>{data.satisfaction.service ?? "—"}</p><p className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>service</p></div>
              </div>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-subtle)" }}>{data.satisfaction.responses} responses</p>
            </div>
          </div>

          {/* ── B. Customer Interest & Product Insights ────────────────────── */}
          {sectionHeader("Customer Interest & Product Insights", "ความสนใจของลูกค้าและข้อมูลสินค้า")}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {card("Items scanned", data.summary.totalScans, `${data.summary.uniqueProducts} unique`)}
          </div>

          {/* Brands of interest + categories */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {bars("Brands scanned", data.byBrand, maxBrand, "var(--color-primary)")}
            {bars("Categories", data.byCategory, maxCat, "#9f886c")}
          </div>

          {/* Most-scanned products */}
          <div className="grid grid-cols-1 gap-4">
            {productTable("Most-scanned products", data.scannedProducts, "scan")}
          </div>

          {/* ── C. Sample & Display Management ─────────────────────────────── */}
          {sectionHeader("Sample & Display Management", "การจัดการตัวอย่างและสินค้าจัดแสดง")}

          {/* Samples given = total takeaway pieces taken home by customers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {card("Samples given", data.summary.totalTaken, "pieces taken home")}
          </div>

          {/* Takeaway breakdown by product */}
          <div className="grid grid-cols-1 gap-4">
            {productTable("Samples taken home", data.takenHomeProducts, "taken")}
          </div>
        </div>
      )}
    </div>
  );
}

function productTable(title: string, rows: ProductRow[], mode: "scan" | "taken") {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #f0eee6" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{title}</p>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{rows.length} items</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm py-10 text-center" style={{ color: "var(--color-text-subtle)" }}>No data in this period</p>
      ) : (
        <div className="max-h-[60vh] overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr style={{ color: "var(--color-text-muted)" }}>
                <th className="text-left font-normal px-5 py-2 text-xs">Product</th>
                <th className="text-right font-normal px-3 py-2 text-xs whitespace-nowrap">{mode === "scan" ? "Scans" : "Taken"}</th>
                {mode === "scan" && <th className="text-right font-normal px-5 py-2 text-xs whitespace-nowrap">Taken</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product.id} style={{ borderTop: "1px solid var(--color-bg)" }}>
                  <td className="px-5 py-2.5">
                    <p style={{ color: "var(--color-text)" }} className="truncate">{r.product.name}</p>
                    <p className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>{[r.product.productCode, r.product.brand, r.product.category].filter(Boolean).join(" · ") || "—"}</p>
                  </td>
                  <td className="text-right px-3 py-2.5 tabular-nums" style={{ color: "var(--color-text)" }}>{mode === "scan" ? r.scanCount : r.takenQty}</td>
                  {mode === "scan" && <td className="text-right px-5 py-2.5 tabular-nums" style={{ color: r.takenQty > 0 ? "#4a7c59" : "var(--color-text-subtle)" }}>{r.takenQty}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
