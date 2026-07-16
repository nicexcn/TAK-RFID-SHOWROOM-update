"use client";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/Skeleton";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import { toCsv } from "@/lib/csv";
import { customerTypeLabel } from "@/lib/customerTypes";
import { formatDate } from "@/lib/formatDate";
import { toast } from "sonner";

const errorToastStyle = {
  style: { background: "var(--color-danger-soft)", color: "var(--color-surface)", border: "none", borderRadius: "0.75rem" },
};

const GRAPH_COLORS = [
  { primary: "var(--color-primary)", secondary: "var(--color-sidebar)" },
  { primary: "#4a6fa5", secondary: "#a8c0dd" },
  { primary: "#4a7c59", secondary: "#a8cbb5" },
  { primary: "#9f6b6b", secondary: "#d4a8a8" },
  { primary: "var(--color-text)", secondary: "var(--color-icon-muted)" },
];

type FilterPeriod = "daily" | "weekly" | "monthly" | "annually";

interface DashboardStats {
  totalCustomers: number;
  newCustomers: number;
  totalSessions: number;
  customersByTitle: { title: string; count: number }[];
  customersByChannel: { channel: string; count: number }[];
  sessionsByMonth: { month: string; count: number }[];
  scansByCategory: { name: string; value: number }[];
  scansByMaterial: { name: string; value: number }[];
  scansByBrand: { name: string; value: number }[];
}

function FilterButtons({ value, onChange }: { value: FilterPeriod | null; onChange: (v: FilterPeriod) => void }) {
  return (
    <div className="flex gap-1" role="tablist" aria-label="Date range preset">
      {(["daily", "weekly", "monthly", "annually"] as FilterPeriod[]).map((o) => (
        <button key={o} onClick={() => onChange(o)}
          role="tab" aria-selected={value === o} aria-current={value === o ? "true" : undefined}
          className="px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all"
          style={{ background: value === o ? "var(--color-primary)" : "var(--color-bg)", color: value === o ? "var(--color-surface)" : "var(--color-text-muted)", border: "1px solid " + (value === o ? "var(--color-primary)" : "var(--color-border)") }}>
          {o.charAt(0).toUpperCase() + o.slice(1)}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
        <svg width="18" height="18" fill="none" stroke="var(--color-sidebar)" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <p className="text-xs text-center" style={{ color: "var(--color-text-subtle)" }}>{label}</p>
    </div>
  );
}

// ── Draggable Card Wrapper ──────────────────────────────────────────────────
// Keeps native drag-and-drop for pointer users, and adds keyboard-operable
// "Move up"/"Move down" buttons (same state setter) so the reorder is a11y-usable.
function DraggableCard({
  id, label, dragOver, onDragStart, onDragEnter, onDragEnd, onMoveUp, onMoveDown, canMoveUp, canMoveDown, children,
}: {
  id: string;
  label: string;
  dragOver: string | null;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(id)}
      onDragEnter={() => onDragEnter(id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className="rounded-xl transition-all duration-200 relative group"
      style={{
        background: "var(--color-surface)",
        border: "1px solid " + (dragOver === id ? "var(--color-primary)" : "var(--color-border)"),
        opacity: dragOver === id ? 0.7 : 1,
        cursor: "grab",
        transform: dragOver === id ? "scale(0.98)" : "scale(1)",
      }}
    >
      {/* Reorder controls — hidden until the card is hovered or a button is keyboard-focused,
          so they don't clutter/overlap each card's own header content by default. Opaque
          surface bg + shadow so they read cleanly when revealed. */}
      <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button type="button" onClick={() => onMoveUp(id)} disabled={!canMoveUp}
          aria-label={`Move ${label} up`}
          className="w-6 h-6 rounded-md flex items-center justify-center disabled:opacity-30 shadow-sm"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button type="button" onClick={() => onMoveDown(id)} disabled={!canMoveDown}
          aria-label={`Move ${label} down`}
          className="w-6 h-6 rounded-md flex items-center justify-center disabled:opacity-30 shadow-sm"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  );
}

// Persist the dashboard's selected range across reloads/navigation (per browser).
const RANGE_KEY = "tak-dash-range";
type SavedRange = { rangeMode: "preset" | "custom"; statFilter: FilterPeriod; customFrom: string; customTo: string };
function readSavedRange(): SavedRange | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RANGE_KEY);
    return raw ? (JSON.parse(raw) as SavedRange) : null;
  } catch { return null; }
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {

  // Export + date range (the range drives BOTH the stats view and the exports)
  const [showExport, setShowExport] = useState(false);
  const [exportingCustomers, setExportingCustomers] = useState(false);
  // Item 6: only Super Admin may export the customer database (Admin + Management can export the
  // aggregate department summary, but not the raw customer records).
  const [role, setRole] = useState("");
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.role) setRole(d.role); }).catch(() => {}); }, []);
  const [rangeMode, setRangeMode] = useState<"preset" | "custom">(() => readSavedRange()?.rangeMode ?? "preset");
  const [customFrom, setCustomFrom] = useState(() => readSavedRange()?.customFrom ?? "");
  const [customTo, setCustomTo] = useState(() => readSavedRange()?.customTo ?? "");

  // Copy
  const [copiedChart, setCopiedChart] = useState("");
  function copyChartData(label: string, data: string) {
    navigator.clipboard.writeText(data).then(() => {
      setCopiedChart(label);
      setTimeout(() => setCopiedChart(""), 2000);
    });
  }

  // The currently-selected window (custom dates or the active preset), as YYYY-MM-DD.
  function currentRange(): { from: string; to: string } {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (rangeMode === "custom" && customFrom && customTo) return { from: customFrom, to: customTo };
    const now = new Date(); const f = new Date();
    if (statFilter === "weekly") f.setDate(now.getDate() - 7);
    else if (statFilter === "monthly") f.setMonth(now.getMonth() - 1);
    else if (statFilter === "annually") f.setFullYear(now.getFullYear() - 1);
    else f.setHours(0, 0, 0, 0); // daily
    return { from: iso(f), to: iso(now) };
  }

  function saveCsv(rows: unknown[][], name: string) {
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setShowExport(false);
  }

  // Summary = the aggregated numbers behind the dashboard widgets, for the selected range.
  function handleExportSummary() {
    if (!stats) return;
    const { from, to } = currentRange();
    saveCsv([
      ["Dashboard Summary", `${from} -> ${to}`], [],
      ["Metric", "Value"],
      ["Total customers", stats.totalCustomers],
      ["New customers", stats.newCustomers],
      ["Visits (sessions)", stats.totalSessions], [],
      ["Customer Type", "Count"], ...stats.customersByTitle.map((t) => [customerTypeLabel(t.title), t.count]), [],
      ["Know Channel", "Count"], ...stats.customersByChannel.map((c) => [c.channel, c.count]), [],
      ["Month", "Visits"], ...stats.sessionsByMonth.map((m) => [m.month, m.count]), [],
      ["Category", "Scans"], ...stats.scansByCategory.map((c) => [c.name, c.value]), [],
      ["Material", "Scans"], ...stats.scansByMaterial.map((c) => [c.name, c.value]), [],
      ["Brand", "Scans"], ...stats.scansByBrand.map((c) => [c.name, c.value]),
    ], `dashboard_summary_${from}_${to}.csv`);
  }

  // Raw = the customer records registered within the selected range.
  async function handleExportCustomers() {
    if (exportingCustomers) return;
    setExportingCustomers(true);
    try {
      const { from, to } = currentRange();
      const res = await fetch(`/api/customers?from=${from}&to=${to}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) { toast("No customers in this range", errorToastStyle); return; }
      const rows = [
        ["Code", "Full Name", "Title", "Company", "Phone", "Email", "Channels", "Registered"],
        ...data.map((c: { customerCode: string; fullName: string; title: string; company: string; phone: string; email: string; knowChannel: string[]; createdAt: string }) => [
          c.customerCode, c.fullName, c.title, c.company, c.phone, c.email,
          c.knowChannel.join(";"), formatDate(c.createdAt),
        ]),
      ];
      const csv = toCsv(rows);
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `customers_${from}_${to}.csv`; a.click();
      URL.revokeObjectURL(url);
      setShowExport(false);
    } catch {
      toast("Export failed. Please try again.", errorToastStyle);
    } finally {
      setExportingCustomers(false);
    }
  }

  // Filters
  const [statFilter, setStatFilter] = useState<FilterPeriod>(() => readSavedRange()?.statFilter ?? "daily");
  const [rightFilter, setRightFilter] = useState<"category" | "material" | "brand">("category");

  // Settings
  const [appSettings, setAppSettings] = useState({
    defaultFilter: "daily" as FilterPeriod,
    graphColor: 0,
    visibleWidgets: { walkins: true, customerTypes: true, newVsTotal: true, comparisonGraph: true, categoryGraph: true },
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Stats
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Drag & Drop — card order for stats row
  const DEFAULT_ORDER = ["walkins", "customerTypes", "newVsTotal"];
  const [cardOrder, setCardOrder] = useState<string[]>(DEFAULT_ORDER);
  const dragItem = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Drag & Drop — chart row
  const DEFAULT_CHART_ORDER = ["sessions", "category"];
  const [chartOrder, setChartOrder] = useState<string[]>(DEFAULT_CHART_ORDER);
  const dragChartItem = useRef<string | null>(null);
  const [dragChartOver, setDragChartOver] = useState<string | null>(null);

  // Announced to screen readers whenever the card/chart order changes (drag or keyboard).
  const [reorderStatus, setReorderStatus] = useState("");
  const CARD_LABELS: Record<string, string> = {
    walkins: "Visits", customerTypes: "Type of Customers", newVsTotal: "New vs Returning",
    sessions: "Visits by Month", category: "Interest by Category",
  };
  function announceOrder(order: string[], moved: string) {
    const pos = order.indexOf(moved) + 1;
    setReorderStatus(`${CARD_LABELS[moved] ?? moved} moved to position ${pos} of ${order.length}.`);
  }
  function moveInOrder(order: string[], id: string, dir: -1 | 1): string[] {
    const from = order.indexOf(id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= order.length) return order;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    return next;
  }
  function moveCard(id: string, dir: -1 | 1) {
    setCardOrder((prev) => { const next = moveInOrder(prev, id, dir); if (next !== prev) announceOrder(next, id); return next; });
  }
  function moveChart(id: string, dir: -1 | 1) {
    setChartOrder((prev) => { const next = moveInOrder(prev, id, dir); if (next !== prev) announceOrder(next, id); return next; });
  }

  function handleDragStart(id: string) { dragItem.current = id; }
  function handleDragEnter(id: string) { setDragOver(id); }
  function handleDragEnd() {
    if (dragItem.current && dragOver && dragItem.current !== dragOver) {
      const moved = dragItem.current;
      setCardOrder((prev) => {
        const next = [...prev];
        const from = next.indexOf(moved);
        const to = next.indexOf(dragOver);
        next.splice(from, 1);
        next.splice(to, 0, moved);
        announceOrder(next, moved);
        return next;
      });
    }
    dragItem.current = null;
    setDragOver(null);
  }

  function handleChartDragStart(id: string) { dragChartItem.current = id; }
  function handleChartDragEnter(id: string) { setDragChartOver(id); }
  function handleChartDragEnd() {
    if (dragChartItem.current && dragChartOver && dragChartItem.current !== dragChartOver) {
      const moved = dragChartItem.current;
      setChartOrder((prev) => {
        const next = [...prev];
        const from = next.indexOf(moved);
        const to = next.indexOf(dragChartOver);
        next.splice(from, 1);
        next.splice(to, 0, moved);
        announceOrder(next, moved);
        return next;
      });
    }
    dragChartItem.current = null;
    setDragChartOver(null);
  }

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((data) => {
      if (data.id) {
        setAppSettings({ defaultFilter: data.defaultFilter, graphColor: data.graphColor, visibleWidgets: data.visibleWidgets });
        if (!readSavedRange()) setStatFilter(data.defaultFilter); // a saved range wins over the default
      }
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, []);

  // Remember the selected range (preset or custom dates) so it survives reload/navigation —
  // but ONLY once the user actually picks one. Persisting on mount would write RANGE_KEY
  // before the async /api/settings fetch resolves, so `!readSavedRange()` above would always
  // be false and the configured Default Filter would never apply (it was always "daily").
  const userPickedRange = useRef(false);
  useEffect(() => {
    if (!userPickedRange.current) return; // no user pick yet → let the Settings default win
    try {
      window.localStorage.setItem(RANGE_KEY, JSON.stringify({ rangeMode, statFilter, customFrom, customTo }));
    } catch { /* storage unavailable (private mode) — range just won't persist */ }
  }, [rangeMode, statFilter, customFrom, customTo]);

  // Only the latest request's result is applied. Otherwise the initial fetch and
  // the settings-driven defaultFilter fetch race, and a slow earlier response
  // overwrites the newer one — the "Walk-ins flickers 1 → 34 → 1" bug.
  const statsReqRef = useRef(0);
  useEffect(() => {
    if (!settingsLoaded) return; // wait for defaultFilter so we fetch once, with the right period
    const custom = rangeMode === "custom";
    if (custom && (!customFrom || !customTo)) return; // wait until both dates are picked
    const reqId = ++statsReqRef.current;
    setLoadingStats(true);
    const qs = custom ? `from=${customFrom}&to=${customTo}` : `period=${statFilter}`;
    fetch(`/api/dashboard?${qs}`)
      .then((r) => r.json())
      .then((data) => { if (reqId === statsReqRef.current) { setStats(data); setLoadingStats(false); } })
      .catch(() => { if (reqId === statsReqRef.current) setLoadingStats(false); });
  }, [statFilter, rangeMode, customFrom, customTo, settingsLoaded]);

  const color = GRAPH_COLORS[appSettings.graphColor] ?? GRAPH_COLORS[0];
  const dateRange = currentRange(); // effective from→to for the active preset or custom window
  const hasCustomers = (stats?.totalCustomers ?? 0) > 0;
  const compData = stats?.sessionsByMonth ?? [];
  const rightChartData = {
    category: stats?.scansByCategory ?? [],
    material: stats?.scansByMaterial ?? [],
    brand: stats?.scansByBrand ?? [],
  };

  // Pie data for New vs Total
  const pieData = hasCustomers ? [
    { name: "New", value: stats!.newCustomers, color: color.primary },
    { name: "Returning", value: stats!.totalCustomers - stats!.newCustomers, color: color.secondary },
  ] : [];

  // Header (title / breadcrumb / export / search) is static chrome — render it
  // immediately in every branch. Only the data regions below get skeletons.
  const headerEl = (
    <>
      <PageHeader
        title="Dashboard"
        crumbs={[{ label: "Home", href: "/admin" }, { label: "Dashboard" }]}
        actions={
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Export */}
          <div className="relative">
            <button onClick={() => setShowExport(!showExport)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Data
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-xl shadow-xl z-50 p-5"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-text)" }}>Export CSV</p>
                <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>
                  Range: {formatDate(dateRange.from)} → {formatDate(dateRange.to)}
                </p>
                <button onClick={handleExportSummary} disabled={!stats}
                  className="w-full mb-2 py-2.5 rounded-xl text-sm font-medium text-white text-left px-4"
                  style={{ background: "var(--color-primary)", opacity: stats ? 1 : 0.5 }}>
                  📊 Dashboard Summary
                  <span className="block text-[11px] font-normal opacity-80">Aggregated stats for the selected range</span>
                </button>
                {role === "super_admin" && (
                  <button onClick={handleExportCustomers} disabled={exportingCustomers}
                    className="w-full py-2.5 rounded-xl text-sm font-medium text-left px-4 disabled:cursor-wait"
                    style={{ background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)", opacity: exportingCustomers ? 0.6 : 1 }}>
                    {exportingCustomers ? "⏳ Exporting…" : "👤 Customers (raw)"}
                    <span className="block text-[11px] font-normal" style={{ color: "var(--color-text-muted)" }}>Customers registered in this range</span>
                  </button>
                )}
              </div>
            )}
          </div>
          {/* Search */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl flex-1 min-w-0 sm:flex-none sm:w-56"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <svg width="14" height="14" fill="none" stroke="var(--color-icon-muted)" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input placeholder="Search product..." aria-label="Search product" className="outline-none text-sm w-full"
              style={{ background: "transparent", color: "var(--color-text)" }} />
          </div>
        </div>
        }
      />
      {showExport && <div className="fixed inset-0 z-40" onClick={() => setShowExport(false)} />}
    </>
  );

  if (!settingsLoaded) return (
    <div>
      {headerEl}
      {/* Filter row placeholder — its active preset depends on settings, so skeleton it. */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <Skeleton className="h-3" style={{ width: "14rem" }} />
        <Skeleton className="h-7" style={{ width: "18rem" }} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-5 rounded-xl" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <Skeleton className="h-3 mb-3" style={{ width: "40%" }} />
            <Skeleton className="h-8 mb-2" style={{ width: "55%" }} />
            <Skeleton className="h-3" style={{ width: "70%" }} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="p-5 rounded-xl" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <Skeleton className="h-4 mb-4" style={{ width: "35%" }} />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );

  // ── Card renderers ──────────────────────────────────────────────────────
  function renderCard(id: string) {
    if (id === "walkins") return (
      <div className="p-5 h-full">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Visits</p>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
              <svg width="14" height="14" fill="none" stroke="var(--color-primary)" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <svg width="14" height="14" fill="none" stroke="var(--color-sidebar)" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="5" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="5" r="1" fill="var(--color-sidebar)" />
              <circle cx="9" cy="12" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="12" r="1" fill="var(--color-sidebar)" />
              <circle cx="9" cy="19" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="19" r="1" fill="var(--color-sidebar)" />
            </svg>
          </div>
        </div>
        {loadingStats ? <div className="space-y-2 my-2"><Skeleton className="h-7" style={{ width: "45%" }} /><Skeleton className="h-3" style={{ width: "70%" }} /><Skeleton className="h-3" style={{ width: "55%" }} /></div> : (
          <>
            <p className="text-3xl font-semibold mb-1" style={{ color: "var(--color-text)" }}>{(stats?.totalSessions ?? 0).toLocaleString()}</p>
            <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>{stats?.totalSessions === 0 ? "No visits yet" : "Total sessions"}</p>
          </>
        )}
      </div>
    );

    if (id === "customerTypes") return (
      <div className="p-5 h-full">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Type of Customers</p>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
              <svg width="14" height="14" fill="none" stroke="var(--color-primary)" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <svg width="14" height="14" fill="none" stroke="var(--color-sidebar)" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="5" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="5" r="1" fill="var(--color-sidebar)" />
              <circle cx="9" cy="12" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="12" r="1" fill="var(--color-sidebar)" />
              <circle cx="9" cy="19" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="19" r="1" fill="var(--color-sidebar)" />
            </svg>
          </div>
        </div>
        {loadingStats ? <div className="space-y-2 my-2"><Skeleton className="h-7" style={{ width: "45%" }} /><Skeleton className="h-3" style={{ width: "70%" }} /><Skeleton className="h-3" style={{ width: "55%" }} /></div> : !hasCustomers ? <EmptyState label={"No customers\nregistered yet"} /> : (
          <>
            <p className="text-3xl font-semibold mb-1" style={{ color: "var(--color-text)" }}>{stats!.customersByTitle[0] ? customerTypeLabel(stats!.customersByTitle[0].title) : "-"}</p>
            <p className="text-xs mb-3" style={{ color: "var(--color-text-subtle)" }}>Top type · {stats!.customersByTitle[0]?.count ?? 0} people</p>
            <div className="space-y-1">
              {stats!.customersByTitle.slice(0, 4).map((d) => (
                <div key={d.title} className="flex items-center gap-2">
                  <p className="text-xs w-24 truncate" style={{ color: "var(--color-text-muted)" }}>{customerTypeLabel(d.title)}</p>
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--color-bg)" }}>
                    <div className="h-full rounded-full" style={{ background: color.primary, width: `${stats!.totalCustomers > 0 ? (d.count / stats!.totalCustomers) * 100 : 0}%` }} />
                  </div>
                  <p className="text-xs w-6 text-right" style={{ color: "var(--color-text-muted)" }}>{d.count}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );

    if (id === "newVsTotal") return (
      <div className="p-5 h-full">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>New vs Returning</p>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
              <svg width="14" height="14" fill="none" stroke="var(--color-primary)" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
              </svg>
            </div>
            <svg width="14" height="14" fill="none" stroke="var(--color-sidebar)" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="5" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="5" r="1" fill="var(--color-sidebar)" />
              <circle cx="9" cy="12" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="12" r="1" fill="var(--color-sidebar)" />
              <circle cx="9" cy="19" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="19" r="1" fill="var(--color-sidebar)" />
            </svg>
          </div>
        </div>
        {loadingStats ? <div className="space-y-2 my-2"><Skeleton className="h-7" style={{ width: "45%" }} /><Skeleton className="h-3" style={{ width: "70%" }} /><Skeleton className="h-3" style={{ width: "55%" }} /></div> : !hasCustomers ? <EmptyState label={"No customers\nregistered yet"} /> : (
          <>
            <ResponsiveContainer width="100%" height={120}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={32} outerRadius={52} dataKey="value" paddingAngle={2}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} people`, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-1">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );

    return null;
  }

  function renderChart(id: string) {
    if (id === "sessions") return (
      <div className="p-5">
        {/* Copy sits in the left group (not top-right) so it never collides with the
            DraggableCard reorder buttons that reveal in the top-right corner. pr-16 keeps
            the row clear of those buttons on hover. */}
        <div className="flex items-center gap-2 mb-4 pr-16">
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Visits by Month</h2>
          <svg width="14" height="14" fill="none" stroke="var(--color-sidebar)" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="9" cy="5" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="5" r="1" fill="var(--color-sidebar)" />
            <circle cx="9" cy="12" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="12" r="1" fill="var(--color-sidebar)" />
            <circle cx="9" cy="19" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="19" r="1" fill="var(--color-sidebar)" />
          </svg>
          <button onClick={() => copyChartData("sessions", compData.map((d) => `${d.month}: ${d.count}`).join("\n"))}
            className="px-2 py-1 rounded-lg text-xs"
            style={{ background: "var(--color-bg)", color: copiedChart === "sessions" ? "var(--color-success)" : "var(--color-text-muted)" }}>
            {copiedChart === "sessions" ? "✓ Copied" : "Copy"}
          </button>
        </div>
        {loadingStats ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : compData.length === 0 ? <EmptyState label="No visits yet" /> : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={compData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--color-icon-muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-icon-muted)" }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" name="Visits" stroke={color.primary} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    );

    if (id === "category") return (
      <div className="p-5">
        <div className="flex items-center gap-2 mb-1 pr-16">
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Interest by Category</h2>
          <svg width="14" height="14" fill="none" stroke="var(--color-sidebar)" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="9" cy="5" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="5" r="1" fill="var(--color-sidebar)" />
            <circle cx="9" cy="12" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="12" r="1" fill="var(--color-sidebar)" />
            <circle cx="9" cy="19" r="1" fill="var(--color-sidebar)" /><circle cx="15" cy="19" r="1" fill="var(--color-sidebar)" />
          </svg>
          <button onClick={() => copyChartData("category", (rightChartData[rightFilter] ?? []).map((d) => `${d.name}: ${d.value}`).join("\n"))}
            className="px-2 py-1 rounded-lg text-xs"
            style={{ background: "var(--color-bg)", color: copiedChart === "category" ? "var(--color-success)" : "var(--color-text-muted)" }}>
            {copiedChart === "category" ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <div className="flex gap-1 mb-4" role="tablist" aria-label="Interest breakdown">
          {[{ key: "category", label: "Category" }, { key: "material", label: "Material" }, { key: "brand", label: "Brand" }].map((opt) => (
            <button key={opt.key} onClick={() => setRightFilter(opt.key as typeof rightFilter)}
              role="tab" aria-selected={rightFilter === opt.key} aria-current={rightFilter === opt.key ? "true" : undefined}
              className="px-2 py-1 rounded-lg text-xs font-medium"
              style={{ background: rightFilter === opt.key ? "var(--color-primary)" : "var(--color-bg)", color: rightFilter === opt.key ? "var(--color-surface)" : "var(--color-text-muted)", border: "1px solid " + (rightFilter === opt.key ? "var(--color-primary)" : "var(--color-border)") }}>
              {opt.label}
            </button>
          ))}
        </div>
        {loadingStats ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : (rightChartData[rightFilter] ?? []).length === 0 ? <EmptyState label="No scan data yet" /> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rightChartData[rightFilter]} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-icon-muted)" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--color-icon-muted)" }} width={72} />
              <Tooltip />
              <Bar dataKey="value" fill={color.primary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    );

    return null;
  }

  // Widget Visibility (Settings): hide a card/chart when its toggle is off. Chart ids map
  // to their settings keys (sessions→comparisonGraph, category→categoryGraph).
  const WIDGET_KEY: Record<string, keyof typeof appSettings.visibleWidgets> = {
    walkins: "walkins", customerTypes: "customerTypes", newVsTotal: "newVsTotal",
    sessions: "comparisonGraph", category: "categoryGraph",
  };
  const isWidgetVisible = (id: string) => appSettings.visibleWidgets?.[WIDGET_KEY[id]] !== false;

  return (
    <div>
      {headerEl}

      {/* Filter row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
          Showing stats for: <span style={{ color: "var(--color-text-muted)" }}>{formatDate(dateRange.from)} → {formatDate(dateRange.to)}</span>
        </p>
        <div className="flex items-center gap-2 flex-wrap" role="tablist" aria-label="Date range mode">
          <FilterButtons value={rangeMode === "preset" ? statFilter : null} onChange={(v) => { userPickedRange.current = true; setRangeMode("preset"); setStatFilter(v); }} />
          <button onClick={() => { userPickedRange.current = true; setRangeMode("custom"); }}
            role="tab" aria-selected={rangeMode === "custom"} aria-current={rangeMode === "custom" ? "true" : undefined}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
            style={{ background: rangeMode === "custom" ? "var(--color-primary)" : "var(--color-bg)", color: rangeMode === "custom" ? "var(--color-surface)" : "var(--color-text-muted)", border: "1px solid " + (rangeMode === "custom" ? "var(--color-primary)" : "var(--color-border)") }}>
            Custom
          </button>
          {rangeMode === "custom" && (
            <div className="flex items-center gap-1">
              <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => { userPickedRange.current = true; setCustomFrom(e.target.value); }}
                className="px-2 py-1 rounded-lg outline-none text-xs" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>–</span>
              <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => { userPickedRange.current = true; setCustomTo(e.target.value); }}
                className="px-2 py-1 rounded-lg outline-none text-xs" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Stats Cards (draggable) ── */}
      <p className="text-xs mb-2" style={{ color: "var(--color-text-subtle)" }}>Drag a card, or use the arrow buttons, to reorder</p>
      {/* Screen-reader announcement of the new order (drag or keyboard) */}
      <div aria-live="polite" className="sr-only">{reorderStatus}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {(() => { const visible = cardOrder.filter(isWidgetVisible); return visible.map((id, i) => (
          <DraggableCard key={id} id={id} label={CARD_LABELS[id] ?? id} dragOver={dragOver}
            onDragStart={handleDragStart} onDragEnter={handleDragEnter} onDragEnd={handleDragEnd}
            onMoveUp={(x) => moveCard(x, -1)} onMoveDown={(x) => moveCard(x, 1)}
            canMoveUp={i > 0} canMoveDown={i < visible.length - 1}>
            {renderCard(id)}
          </DraggableCard>
        )); })()}
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl p-5 mb-6" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: "Add Customer", sub: "Register new customer", href: "/admin/customers/add" },
            { label: "Add Product", sub: "Register new product", href: "/admin/products/new" },
          ].map((action) => (
            <Link key={action.label} href={action.href}
              className="flex flex-col items-center justify-center p-6 rounded-xl transition-all"
              style={{ border: "1.5px dashed var(--color-sidebar)", background: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "var(--color-bg)" }}>
                <svg width="18" height="18" fill="none" stroke="var(--color-primary)" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{action.label}</p>
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{action.sub}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Chart Cards (draggable) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(() => { const visible = chartOrder.filter(isWidgetVisible); return visible.map((id, i) => (
          <DraggableCard key={id} id={id} label={CARD_LABELS[id] ?? id} dragOver={dragChartOver}
            onDragStart={handleChartDragStart} onDragEnter={handleChartDragEnter} onDragEnd={handleChartDragEnd}
            onMoveUp={(x) => moveChart(x, -1)} onMoveDown={(x) => moveChart(x, 1)}
            canMoveUp={i > 0} canMoveDown={i < visible.length - 1}>
            {renderChart(id)}
          </DraggableCard>
        )); })()}
      </div>
    </div>
  );
}
