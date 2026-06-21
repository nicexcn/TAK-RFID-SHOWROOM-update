"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import { toCsv } from "@/lib/csv";

const GRAPH_COLORS = [
  { primary: "#726c5a", secondary: "#cdc3ad" },
  { primary: "#4a6fa5", secondary: "#a8c0dd" },
  { primary: "#4a7c59", secondary: "#a8cbb5" },
  { primary: "#9f6b6b", secondary: "#d4a8a8" },
  { primary: "#4c4847", secondary: "#9f886c" },
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
    <div className="flex gap-1">
      {(["daily", "weekly", "monthly", "annually"] as FilterPeriod[]).map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className="px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all"
          style={{ background: value === o ? "#726c5a" : "#f5f2ee", color: value === o ? "#fff" : "#9f886c", border: "1px solid " + (value === o ? "#726c5a" : "#e6e5d8") }}>
          {o.charAt(0).toUpperCase() + o.slice(1)}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#f5f2ee" }}>
        <svg width="18" height="18" fill="none" stroke="#cdc3ad" strokeWidth="1.5" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <p className="text-xs text-center" style={{ color: "#cdc3ad" }}>{label}</p>
    </div>
  );
}

function Spinner() {
  return <div className="w-5 h-5 rounded-full border-2 animate-spin my-2" style={{ borderColor: "#726c5a", borderTopColor: "transparent" }} />;
}

// ── Draggable Card Wrapper ──────────────────────────────────────────────────
function DraggableCard({
  id, dragOver, onDragStart, onDragEnter, onDragEnd, children,
}: {
  id: string;
  dragOver: string | null;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(id)}
      onDragEnter={() => onDragEnter(id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className="rounded-xl transition-all duration-200"
      style={{
        background: "#fff",
        border: "1px solid " + (dragOver === id ? "#726c5a" : "#e6e5d8"),
        opacity: dragOver === id ? 0.7 : 1,
        cursor: "grab",
        transform: dragOver === id ? "scale(0.98)" : "scale(1)",
      }}
    >
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
      ["Walk-ins (sessions)", stats.totalSessions], [],
      ["Customer Type", "Count"], ...stats.customersByTitle.map((t) => [t.title, t.count]), [],
      ["Know Channel", "Count"], ...stats.customersByChannel.map((c) => [c.channel, c.count]), [],
      ["Month", "Walk-ins"], ...stats.sessionsByMonth.map((m) => [m.month, m.count]), [],
      ["Category", "Scans"], ...stats.scansByCategory.map((c) => [c.name, c.value]), [],
      ["Material", "Scans"], ...stats.scansByMaterial.map((c) => [c.name, c.value]), [],
      ["Brand", "Scans"], ...stats.scansByBrand.map((c) => [c.name, c.value]),
    ], `dashboard_summary_${from}_${to}.csv`);
  }

  // Raw = the customer records registered within the selected range.
  async function handleExportCustomers() {
    const { from, to } = currentRange();
    const res = await fetch(`/api/customers?from=${from}&to=${to}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) { alert("No customers in this range"); return; }
    const rows = [
      ["Code", "Full Name", "Title", "Company", "Phone", "Email", "Channels", "Registered"],
      ...data.map((c: { customerCode: string; fullName: string; title: string; company: string; phone: string; email: string; knowChannel: string[]; createdAt: string }) => [
        c.customerCode, c.fullName, c.title, c.company, c.phone, c.email,
        c.knowChannel.join(";"), new Date(c.createdAt).toLocaleDateString("th-TH"),
      ]),
    ];
    const csv = toCsv(rows);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `customers_${from}_${to}.csv`; a.click();
    setShowExport(false);
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

  function handleDragStart(id: string) { dragItem.current = id; }
  function handleDragEnter(id: string) { setDragOver(id); }
  function handleDragEnd() {
    if (dragItem.current && dragOver && dragItem.current !== dragOver) {
      setCardOrder((prev) => {
        const next = [...prev];
        const from = next.indexOf(dragItem.current!);
        const to = next.indexOf(dragOver);
        next.splice(from, 1);
        next.splice(to, 0, dragItem.current!);
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
      setChartOrder((prev) => {
        const next = [...prev];
        const from = next.indexOf(dragChartItem.current!);
        const to = next.indexOf(dragChartOver);
        next.splice(from, 1);
        next.splice(to, 0, dragChartItem.current!);
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

  // Remember the selected range (preset or custom dates) so it survives reload/navigation.
  useEffect(() => {
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

  // Pie data สำหรับ New vs Total
  const pieData = hasCustomers ? [
    { name: "New", value: stats!.newCustomers, color: color.primary },
    { name: "Returning", value: stats!.totalCustomers - stats!.newCustomers, color: color.secondary },
  ] : [];

  if (!settingsLoaded) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "#726c5a", borderTopColor: "transparent" }} />
    </div>
  );

  // ── Card renderers ──────────────────────────────────────────────────────
  function renderCard(id: string) {
    if (id === "walkins") return (
      <div className="p-5 h-full">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm" style={{ color: "#9f886c" }}>Walk-ins</p>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#f5f2ee" }}>
              <svg width="14" height="14" fill="none" stroke="#726c5a" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <svg width="14" height="14" fill="none" stroke="#cdc3ad" strokeWidth="1.5" viewBox="0 0 24 24" aria-label="Drag to reorder">
              <circle cx="9" cy="5" r="1" fill="#cdc3ad" /><circle cx="15" cy="5" r="1" fill="#cdc3ad" />
              <circle cx="9" cy="12" r="1" fill="#cdc3ad" /><circle cx="15" cy="12" r="1" fill="#cdc3ad" />
              <circle cx="9" cy="19" r="1" fill="#cdc3ad" /><circle cx="15" cy="19" r="1" fill="#cdc3ad" />
            </svg>
          </div>
        </div>
        {loadingStats ? <Spinner /> : (
          <>
            <p className="text-3xl font-semibold mb-1" style={{ color: "#4c4847" }}>{(stats?.totalSessions ?? 0).toLocaleString()}</p>
            <p className="text-xs" style={{ color: "#cdc3ad" }}>{stats?.totalSessions === 0 ? "ยังไม่มี session" : "Total sessions"}</p>
          </>
        )}
      </div>
    );

    if (id === "customerTypes") return (
      <div className="p-5 h-full">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm" style={{ color: "#9f886c" }}>Type of Customers</p>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#f5f2ee" }}>
              <svg width="14" height="14" fill="none" stroke="#726c5a" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <svg width="14" height="14" fill="none" stroke="#cdc3ad" strokeWidth="1.5" viewBox="0 0 24 24">
              <circle cx="9" cy="5" r="1" fill="#cdc3ad" /><circle cx="15" cy="5" r="1" fill="#cdc3ad" />
              <circle cx="9" cy="12" r="1" fill="#cdc3ad" /><circle cx="15" cy="12" r="1" fill="#cdc3ad" />
              <circle cx="9" cy="19" r="1" fill="#cdc3ad" /><circle cx="15" cy="19" r="1" fill="#cdc3ad" />
            </svg>
          </div>
        </div>
        {loadingStats ? <Spinner /> : !hasCustomers ? <EmptyState label={"ยังไม่มีลูกค้า\nลงทะเบียน"} /> : (
          <>
            <p className="text-3xl font-semibold mb-1" style={{ color: "#4c4847" }}>{stats!.customersByTitle[0]?.title ?? "-"}</p>
            <p className="text-xs mb-3" style={{ color: "#cdc3ad" }}>Top type · {stats!.customersByTitle[0]?.count ?? 0} คน</p>
            <div className="space-y-1">
              {stats!.customersByTitle.slice(0, 4).map((d) => (
                <div key={d.title} className="flex items-center gap-2">
                  <p className="text-xs w-24 truncate" style={{ color: "#9f886c" }}>{d.title}</p>
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: "#f5f2ee" }}>
                    <div className="h-full rounded-full" style={{ background: color.primary, width: `${stats!.totalCustomers > 0 ? (d.count / stats!.totalCustomers) * 100 : 0}%` }} />
                  </div>
                  <p className="text-xs w-6 text-right" style={{ color: "#9f886c" }}>{d.count}</p>
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
          <p className="text-sm" style={{ color: "#9f886c" }}>New vs Returning</p>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#f5f2ee" }}>
              <svg width="14" height="14" fill="none" stroke="#726c5a" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
              </svg>
            </div>
            <svg width="14" height="14" fill="none" stroke="#cdc3ad" strokeWidth="1.5" viewBox="0 0 24 24">
              <circle cx="9" cy="5" r="1" fill="#cdc3ad" /><circle cx="15" cy="5" r="1" fill="#cdc3ad" />
              <circle cx="9" cy="12" r="1" fill="#cdc3ad" /><circle cx="15" cy="12" r="1" fill="#cdc3ad" />
              <circle cx="9" cy="19" r="1" fill="#cdc3ad" /><circle cx="15" cy="19" r="1" fill="#cdc3ad" />
            </svg>
          </div>
        </div>
        {loadingStats ? <Spinner /> : !hasCustomers ? <EmptyState label={"ยังไม่มีลูกค้า\nลงทะเบียน"} /> : (
          <>
            <ResponsiveContainer width="100%" height={120}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={32} outerRadius={52} dataKey="value" paddingAngle={2}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} คน`, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-1">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="text-xs" style={{ color: "#9f886c" }}>{d.name} ({d.value})</span>
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold" style={{ color: "#4c4847" }}>Walk-ins by Month</h2>
            <svg width="14" height="14" fill="none" stroke="#cdc3ad" viewBox="0 0 24 24">
              <circle cx="9" cy="5" r="1" fill="#cdc3ad" /><circle cx="15" cy="5" r="1" fill="#cdc3ad" />
              <circle cx="9" cy="12" r="1" fill="#cdc3ad" /><circle cx="15" cy="12" r="1" fill="#cdc3ad" />
              <circle cx="9" cy="19" r="1" fill="#cdc3ad" /><circle cx="15" cy="19" r="1" fill="#cdc3ad" />
            </svg>
          </div>
          <button onClick={() => copyChartData("sessions", compData.map((d) => `${d.month}: ${d.count}`).join("\n"))}
            className="px-2 py-1 rounded-lg text-xs"
            style={{ background: "#f5f2ee", color: copiedChart === "sessions" ? "#10b981" : "#9f886c" }}>
            {copiedChart === "sessions" ? "✓ Copied" : "Copy"}
          </button>
        </div>
        {loadingStats ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "#726c5a", borderTopColor: "transparent" }} />
          </div>
        ) : compData.length === 0 ? <EmptyState label="ยังไม่มี session / walk-in" /> : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={compData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f2ee" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9f886c" }} />
              <YAxis tick={{ fontSize: 10, fill: "#9f886c" }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" name="Sessions" stroke={color.primary} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    );

    if (id === "category") return (
      <div className="p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold" style={{ color: "#4c4847" }}>Interest by Category</h2>
            <svg width="14" height="14" fill="none" stroke="#cdc3ad" viewBox="0 0 24 24">
              <circle cx="9" cy="5" r="1" fill="#cdc3ad" /><circle cx="15" cy="5" r="1" fill="#cdc3ad" />
              <circle cx="9" cy="12" r="1" fill="#cdc3ad" /><circle cx="15" cy="12" r="1" fill="#cdc3ad" />
              <circle cx="9" cy="19" r="1" fill="#cdc3ad" /><circle cx="15" cy="19" r="1" fill="#cdc3ad" />
            </svg>
          </div>
          <button onClick={() => copyChartData("category", (rightChartData[rightFilter] ?? []).map((d) => `${d.name}: ${d.value}`).join("\n"))}
            className="px-2 py-1 rounded-lg text-xs"
            style={{ background: "#f5f2ee", color: copiedChart === "category" ? "#10b981" : "#9f886c" }}>
            {copiedChart === "category" ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <div className="flex gap-1 mb-4">
          {[{ key: "category", label: "Category" }, { key: "material", label: "Material" }, { key: "brand", label: "Brand" }].map((opt) => (
            <button key={opt.key} onClick={() => setRightFilter(opt.key as typeof rightFilter)}
              className="px-2 py-1 rounded-lg text-xs font-medium"
              style={{ background: rightFilter === opt.key ? "#726c5a" : "#f5f2ee", color: rightFilter === opt.key ? "#fff" : "#9f886c", border: "1px solid " + (rightFilter === opt.key ? "#726c5a" : "#e6e5d8") }}>
              {opt.label}
            </button>
          ))}
        </div>
        {loadingStats ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "#726c5a", borderTopColor: "transparent" }} />
          </div>
        ) : (rightChartData[rightFilter] ?? []).length === 0 ? <EmptyState label="ยังไม่มีข้อมูล scan" /> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rightChartData[rightFilter]} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: "#9f886c" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#9f886c" }} width={72} />
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Dashboard</h1>
          <p className="text-xs mt-1" style={{ color: "#9f886c" }}>Home / Dashboard</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Export */}
          <div className="relative">
            <button onClick={() => setShowExport(!showExport)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847" }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Data
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-xl shadow-xl z-50 p-5"
                style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "#4c4847" }}>Export CSV</p>
                <p className="text-xs mb-4" style={{ color: "#9f886c" }}>
                  Range: {dateRange.from} → {dateRange.to}
                </p>
                <button onClick={handleExportSummary} disabled={!stats}
                  className="w-full mb-2 py-2.5 rounded-xl text-sm font-medium text-white text-left px-4"
                  style={{ background: "#726c5a", opacity: stats ? 1 : 0.5 }}>
                  📊 Dashboard Summary
                  <span className="block text-[11px] font-normal opacity-80">Aggregated stats for the selected range</span>
                </button>
                <button onClick={handleExportCustomers}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-left px-4"
                  style={{ background: "#f5f2ee", color: "#4c4847", border: "1px solid #e6e5d8" }}>
                  👤 Customers (raw)
                  <span className="block text-[11px] font-normal" style={{ color: "#9f886c" }}>Customers registered in this range</span>
                </button>
              </div>
            )}
          </div>
          {/* Search */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl flex-1 min-w-0 sm:flex-none sm:w-56"
            style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
            <svg width="14" height="14" fill="none" stroke="#9f886c" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input placeholder="Search product..." className="outline-none text-sm w-full"
              style={{ background: "transparent", color: "#4c4847" }} />
          </div>
        </div>
      </div>
      {showExport && <div className="fixed inset-0 z-40" onClick={() => setShowExport(false)} />}

      {/* Filter row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <p className="text-xs font-medium" style={{ color: "#9f886c" }}>
          Showing stats for: <span style={{ color: "#726c5a" }}>{dateRange.from} → {dateRange.to}</span>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterButtons value={rangeMode === "preset" ? statFilter : null} onChange={(v) => { setRangeMode("preset"); setStatFilter(v); }} />
          <button onClick={() => setRangeMode("custom")}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
            style={{ background: rangeMode === "custom" ? "#726c5a" : "#f5f2ee", color: rangeMode === "custom" ? "#fff" : "#9f886c", border: "1px solid " + (rangeMode === "custom" ? "#726c5a" : "#e6e5d8") }}>
            Custom
          </button>
          {rangeMode === "custom" && (
            <div className="flex items-center gap-1">
              <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)}
                className="px-2 py-1 rounded-lg outline-none text-xs" style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847" }} />
              <span className="text-xs" style={{ color: "#9f886c" }}>–</span>
              <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)}
                className="px-2 py-1 rounded-lg outline-none text-xs" style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847" }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Stats Cards (draggable) ── */}
      <p className="text-xs mb-2" style={{ color: "#cdc3ad" }}>ลาก card เพื่อเปลี่ยนตำแหน่ง</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {cardOrder.filter(isWidgetVisible).map((id) => (
          <DraggableCard key={id} id={id} dragOver={dragOver}
            onDragStart={handleDragStart} onDragEnter={handleDragEnter} onDragEnd={handleDragEnd}>
            {renderCard(id)}
          </DraggableCard>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl p-5 mb-6" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
        <h2 className="text-base font-semibold mb-4" style={{ color: "#4c4847" }}>Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: "Add Customer", sub: "Register new customer", href: "/admin/customers/add" },
            { label: "Add Product", sub: "Register new product", href: "/admin/products/new" },
          ].map((action) => (
            <Link key={action.label} href={action.href}
              className="flex flex-col items-center justify-center p-6 rounded-xl transition-all"
              style={{ border: "1.5px dashed #cdc3ad", background: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f2ee")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "#f5f2ee" }}>
                <svg width="18" height="18" fill="none" stroke="#726c5a" strokeWidth="2" viewBox="0 0 24 24">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: "#4c4847" }}>{action.label}</p>
              <p className="text-xs mt-1" style={{ color: "#9f886c" }}>{action.sub}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Chart Cards (draggable) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {chartOrder.filter(isWidgetVisible).map((id) => (
          <DraggableCard key={id} id={id} dragOver={dragChartOver}
            onDragStart={handleChartDragStart} onDragEnter={handleChartDragEnter} onDragEnd={handleChartDragEnd}>
            {renderChart(id)}
          </DraggableCard>
        ))}
      </div>
    </div>
  );
}
