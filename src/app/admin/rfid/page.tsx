"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useWebSocket } from "@/hooks/useWebSocket";
import { getDeviceId, isStationNamed, setDeviceId } from "@/lib/deviceId";

// ── Types ──────────────────────────────────────────────────────────────────
interface Product {
  id: string; name: string; brand: string | null; productCode: string | null;
  materialType: string | null; category: string | null; imageUrl: string | null;
  location: string | null;
}
interface ScanItem {
  id: string; scannedAt: string; product: Product;
  prepareStatus: "NONE" | "PREPARING" | "COMPLETE";
  takeawayQty?: number;
  deviceId: number; // 1-4
}
interface Session {
  id: string; customerCode: string; customerId: string | null; scans: ScanItem[];
}
interface CustomerInfo {
  id: string; customerCode: string; fullName: string; title: string; company: string; phone: string;
}
interface DeviceLog {
  deviceId: number; tag: string; time: string; productName: string | null; ok: boolean;
}

const DEVICES = [1, 2, 3, 4] as const;
type DeviceId = typeof DEVICES[number];

const DEVICE_COLORS: Record<number, { bg: string; badge: string; border: string; text: string }> = {
  1: { bg: "#f0f4ff", badge: "#4a6fa5", border: "#a8c0dd", text: "#4a6fa5" },
  2: { bg: "#f0faf4", badge: "#4a7c59", border: "#a8cbb5", text: "#4a7c59" },
  3: { bg: "#fdf4ec", badge: "#c07a30", border: "#ddb88a", text: "#c07a30" },
  4: { bg: "#faf0f5", badge: "#8a4a6e", border: "#cba8ba", text: "#8a4a6e" },
};

const STATUS_STYLE = {
  NONE:      { label: "",             bg: "transparent", color: "#cdc3ad" },
  PREPARING: { label: "กำลังเตรียม", bg: "#dbeafe",    color: "#3b82f6" },
  COMPLETE:  { label: "พร้อมแล้ว",   bg: "#d1fae5",    color: "#10b981" },
};

// ── Main component (wrapped for Suspense) ─────────────────────────────────
function RFIDPageInner() {
  const searchParams = useSearchParams();
  const preloadCode = searchParams.get("customer") || "";
  const preloadName = searchParams.get("name") || "";

  // Customer
  const [customerQuery, setCustomerQuery] = useState(preloadCode);
  const [searchType, setSearchType] = useState<"code" | "name" | "phone">("code");
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(
    preloadCode && preloadName ? {
      id: "", customerCode: preloadCode, fullName: decodeURIComponent(preloadName),
      title: "", company: "", phone: "",
    } : null
  );
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);

  // Session
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Devices — which ones are connected
  const [connectedDevices, setConnectedDevices] = useState<Set<DeviceId>>(new Set([1]));
  const [activeTab, setActiveTab] = useState<"all" | DeviceId>("all");

  // Per-device RFID input
  const [rfidInputs, setRfidInputs] = useState<Record<number, string>>({ 1: "", 2: "", 3: "", 4: "" });
  const rfidRefs = useRef<Record<number, HTMLInputElement | null>>({ 1: null, 2: null, 3: null, 4: null });

  // Logs
  const [deviceLogs, setDeviceLogs] = useState<DeviceLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<"all" | DeviceId>("all");

  // Misc
  const [takeaway, setTakeaway] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  // ── WebSocket + Pre-loaded Map + Dedup + Batch ──────────────────────────
  const [productMap, setProductMap] = useState<Map<string, Product>>(new Map());
  const seenEpcsRef = useRef<Set<string>>(new Set());
  const scanQueueRef = useRef<Array<{ productId: string; rfidTag: string }>>([]);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [deviceIps, setDeviceIps] = useState<Record<number, string>>({ 1: "", 2: "", 3: "", 4: "" });
  const [wsDeviceId, setWsDeviceId] = useState<DeviceId>(1);
  const [simulating, setSimulating] = useState(false);

  // Station id (Option C ownership key) — read client-side from localStorage
  const [stationId, setStationId] = useState("");
  const [stationNamed, setStationNamed] = useState(true);
  useEffect(() => { setStationId(getDeviceId()); setStationNamed(isStationNamed()); }, []);

  const loadProductMap = useCallback(async () => {
    try {
      const res = await fetch("/api/products?all=true");
      const data = await res.json();
      const items = data.products || data || [];
      const map = new Map<string, Product>();
      for (const p of items) {
        if (p.rfidTag) map.set(p.rfidTag, p);
      }
      setProductMap(map);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadProductMap();
  }, [loadProductMap]);

  const flushScans = useCallback(async () => {
    const batch = [...scanQueueRef.current];
    scanQueueRef.current = [];
    flushTimerRef.current = null;
    if (batch.length === 0 || !session) return;
    try {
      await fetch(`/api/sessions/${session.id}/scans/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scans: batch }),
      });
    } catch {
      scanQueueRef.current.unshift(...batch);
      flushTimerRef.current = setTimeout(flushScans, 2000);
    }
  }, [session]);

  const handleTag = useCallback((epc: string, rssi: number, _count: number, deviceId: DeviceId = 1) => {
    if (!session) return;
    if (seenEpcsRef.current.has(epc)) return;
    seenEpcsRef.current.add(epc);

    const product = productMap.get(epc);
    const logEntry: DeviceLog = {
      deviceId, tag: epc, time: new Date().toLocaleTimeString("th-TH"),
      productName: product?.name || null, ok: !!product,
    };
    setDeviceLogs((p) => [logEntry, ...p].slice(0, 200));

    if (!product) return;

    const fakeScan: ScanItem = {
      id: `ws-${Date.now()}-${epc}`, scannedAt: new Date().toISOString(),
      product, prepareStatus: "NONE", deviceId,
    };
    setSession((p) => p ? { ...p, scans: [fakeScan, ...p.scans] } : p);

    scanQueueRef.current.push({ productId: product.id, rfidTag: epc });
    if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(flushScans, 500);
    }
  }, [session, productMap, flushScans]);

  const wsCallbacks = useMemo(() => ({
    onTag: (epc: string, rssi: number, count: number) => handleTag(epc, rssi, count, wsDeviceId),
  }), [handleTag, wsDeviceId]);

  const ws = useWebSocket({
    url: deviceIps[wsDeviceId] || "",
    onTag: wsCallbacks.onTag,
    enabled: !!session && !!deviceIps[wsDeviceId] && connectedDevices.has(wsDeviceId),
  });

  const runSimulator = useCallback(() => {
    if (!session || productMap.size === 0) return;
    setSimulating(true);
    const tags = Array.from(productMap.keys());
    // จำลอง Fix Reader: ยิง burst ~3000 ครั้งใน ~5 วินาที (ส่วนใหญ่ซ้ำ → test dedup)
    const burstCount = 3000;
    let sent = 0;
    const interval = setInterval(() => {
      if (sent >= burstCount) {
        clearInterval(interval);
        setSimulating(false);
        return;
      }
      // Random tag จาก pool (มี duplicate เยอะ)
      const tag = tags[Math.floor(Math.random() * tags.length)];
      const rssi = Math.floor(Math.random() * 45) - 95;
      handleTag(tag, rssi, 1, 1);
      sent++;
    }, 2); // 2ms = สมจริง Fix Reader (3000 scans ใน ~6 วินาที)
  }, [session, productMap, handleTag]);

  useEffect(() => {
    if (!session) {
      seenEpcsRef.current.clear();
      scanQueueRef.current = [];
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    }
  }, [session]);

  // Auto-start if came from Customer Management
  useEffect(() => {
    // Resume only THIS device's active session (concurrent devices = concurrent customers)
    const url = `/api/sessions?deviceId=${encodeURIComponent(getDeviceId())}`;
    if (preloadCode) {
      fetch(url).then((r) => r.json()).then((data) => {
        if (data?.id && data.customerCode === preloadCode) {
          applyLoadedSession(data);
        } else if (preloadCode) {
          handleStartSessionWith(preloadCode, null);
        }
      });
    } else {
      fetch(url).then((r) => r.json()).then((data) => {
        if (data?.id) setSession({ ...data, scans: data.scans?.map((s: ScanItem) => ({ ...s, prepareStatus: "NONE", deviceId: 1 })) || [] });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStartSessionWith(code: string, custId: string | null) {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerCode: code, customerId: custId, deviceId: getDeviceId() }),
      });
      const data = await res.json();
      // Guard: never enter the active-session branch with a missing id (would make
      // every subsequent scan hit /api/sessions/undefined/scans).
      if (!res.ok || !data?.id) { setError("เริ่ม session ไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
      setSession({ ...data, scans: [] });
    } catch {
      setError("เริ่ม session ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  async function handleSearchCustomer() {
    if (!customerQuery.trim()) return;
    setSearching(true); setSearchError(""); setCustomerInfo(null);
    const res = await fetch(`/api/customers/search?q=${encodeURIComponent(customerQuery.trim())}&type=${searchType}`);
    const data = await res.json();
    if (data?.id) setCustomerInfo(data);
    else setSearchError("ไม่พบข้อมูลสมาชิก");
    setSearching(false);
  }

  async function handleStartSession() {
    const code = customerInfo?.customerCode || customerQuery.trim();
    if (!code) { setError("กรุณาระบุ Customer ID"); return; }
    await handleStartSessionWith(code, customerInfo?.id || null);
  }

  const submitScan = useCallback(async (tag: string, deviceId: DeviceId) => {
    if (!tag.trim() || !session) return;
    setRfidInputs((p) => ({ ...p, [deviceId]: "" }));
    const res = await fetch(`/api/sessions/${session.id}/scans`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfidTag: tag.trim() }),
    });
    const data = await res.json();
    const logEntry: DeviceLog = {
      deviceId, tag: tag.trim(), time: new Date().toLocaleTimeString("th-TH"),
      productName: res.ok ? data.product?.name || null : null,
      ok: res.ok,
    };
    setDeviceLogs((p) => [logEntry, ...p].slice(0, 200));
    if (res.ok) {
      setSession((p) => p ? { ...p, scans: [{ ...data, prepareStatus: "NONE", deviceId }, ...p.scans] } : p);
    } else {
      setError(`[เครื่อง ${deviceId}] Tag not found: ${tag}`);
      setTimeout(() => setError(""), 3000);
    }
  }, [session]);

  function toggleDevice(d: DeviceId) {
    setConnectedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(d)) {
        if (next.size === 1) return prev; // ต้องมีอย่างน้อย 1 เครื่อง
        next.delete(d);
      } else {
        next.add(d);
      }
      return next;
    });
  }

  // Persist a scan's prepare status / takeaway qty (customer req #2) — previously
  // these lived only in React state and were lost on reload / unseen by other stations.
  async function patchScan(scanId: string, body: { prepareStatus?: string; takeawayQty?: number }) {
    if (!session) return;
    try {
      await fetch(`/api/sessions/${session.id}/scans/${scanId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch { /* optimistic UI already applied; the next session load reconciles */ }
  }

  // Hydrate session + takeaway state from the server's real (now-persisted) scan rows.
  function applyLoadedSession(data: { id?: string; scans?: ScanItem[] } & Record<string, unknown>) {
    const scans = (data.scans || []).map((s) => ({ ...s, deviceId: 1 as const }));
    setSession({ ...(data as unknown as Session), scans });
    const tk: Record<string, number> = {};
    for (const s of scans) if (s.takeawayQty) tk[s.id] = s.takeawayQty;
    setTakeaway(tk);
  }

  function changeTakeaway(scanId: string, delta: number) {
    setTakeaway((p) => {
      const next = Math.max(0, (p[scanId] ?? 0) + delta);
      patchScan(scanId, { takeawayQty: next });
      return { ...p, [scanId]: next };
    });
  }

  async function handlePrepare(scan: ScanItem) {
    setSession((p) => p ? { ...p, scans: p.scans.map((s) => s.id === scan.id ? { ...s, prepareStatus: "PREPARING" } : s) } : p);
    await patchScan(scan.id, { prepareStatus: "PREPARING" });
    await fetch("/api/notifications", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: scan.product.id, customerId: session?.customerId || null,
        sessionId: session?.id, title: "เตรียมสินค้าตัวอย่าง",
        message: `${scan.product.name}${scan.product.location ? ` (${scan.product.location})` : ""}`,
      }),
    });
  }

  async function handleMarkComplete(scanId: string) {
    setSession((p) => p ? { ...p, scans: p.scans.map((s) => s.id === scanId ? { ...s, prepareStatus: "COMPLETE" } : s) } : p);
    await patchScan(scanId, { prepareStatus: "COMPLETE" });
  }

  async function handleEndSession() {
    const ending = session;
    if (ending) {
      // F4: persist any queued scans BEFORE tearing down, then
      // F1: close the session server-side (it stays active otherwise).
      try {
        if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
        await flushScans();
        await fetch(`/api/sessions/${ending.id}`, { method: "PATCH" });
      } catch { /* best-effort; UI still resets */ }
    }
    seenEpcsRef.current.clear();
    setSession(null); setCustomerQuery(""); setCustomerInfo(null);
    setSearchError(""); setError(""); setTakeaway({}); setDeviceLogs([]);
    setConnectedDevices(new Set([1])); setActiveTab("all");
  }

  async function handleSendToDisplay() {
    if (!session?.id) return;
    setSending(true); setSendSuccess(false);
    try {
      const res = await fetch("/api/sessions/display", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
      if (res.ok) {
        setSendSuccess(true); setTimeout(() => setSendSuccess(false), 3000);
      } else {
        setError("ส่งขึ้นจอไม่สำเร็จ"); setTimeout(() => setError(""), 3000);
      }
    } catch {
      setError("ส่งขึ้นจอไม่สำเร็จ"); setTimeout(() => setError(""), 3000);
    } finally {
      setSending(false);
    }
  }

  // Filtered scans by tab
  const visibleScans = session?.scans.filter((s) =>
    activeTab === "all" ? true : s.deviceId === activeTab
  ) ?? [];

  const filteredLogs = deviceLogs.filter((l) => logFilter === "all" || l.deviceId === logFilter);

  const btnStyle = { background: "#726c5a", color: "#fff" };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Surface Scan</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs" style={{ color: "#9f886c" }}>Home / Surface Scan</p>
            <button
              onClick={() => {
                const cur = getDeviceId();
                const v = window.prompt("ตั้งชื่อ Station (เครื่องนี้) เช่น station-table, tablet-2", cur);
                if (v && v.trim()) { setDeviceId(v); setStationId(v.trim()); }
              }}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: stationNamed ? "#f0f4ff" : "#fff0f0", color: stationNamed ? "#4a6fa5" : "#9f4a4a", border: `1px solid ${stationNamed ? "#a8c0dd" : "#f5c0c0"}` }}
              title="คลิกเพื่อตั้ง/แก้ Station id">
              📍 {stationId || "ตั้งชื่อ Station"}{!stationNamed && " (ยังไม่ได้ตั้ง)"}
            </button>
          </div>
        </div>
        {session && (
          <div className="flex items-center gap-2">
            {sendSuccess && <p className="text-xs" style={{ color: "#10b981" }}>✓ Sent to display</p>}
            <button onClick={() => setShowLogs(!showLogs)}
              className="px-4 py-2 rounded-xl text-sm flex items-center gap-2"
              style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#4c4847" }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              Device Log {deviceLogs.length > 0 && `(${deviceLogs.length})`}
            </button>
            <button onClick={handleSendToDisplay} disabled={sending || session.scans.length === 0}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
              style={{ ...btnStyle, opacity: (sending || session.scans.length === 0) ? 0.5 : 1 }}>
              {sending ? "Sending..." : "Send to Display"}
            </button>
            <button onClick={handleEndSession}
              className="px-4 py-2 rounded-xl text-sm"
              style={{ background: "#fff0f0", color: "#9f4a4a", border: "1px solid #f5c0c0" }}>
              End Session
            </button>
          </div>
        )}
      </div>

      {!session ? (
        /* ── Start Session ── */
        <div className="max-w-md mx-auto mt-12">
          <div className="rounded-2xl p-8" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
            <h2 className="text-lg font-semibold mb-1 text-center" style={{ color: "#4c4847" }}>Start New Session</h2>
            <p className="text-sm mb-6 text-center" style={{ color: "#9f886c" }}>ค้นหาลูกค้าหรือกรอก ID เพื่อเริ่ม session</p>
            <div className="flex rounded-xl overflow-hidden mb-4" style={{ background: "#f5f2ee" }}>
              {(["code","name","phone"] as const).map((t) => (
                <button key={t} onClick={() => { setSearchType(t); setCustomerQuery(""); setSearchError(""); setCustomerInfo(null); }}
                  className="flex-1 py-2 text-xs font-medium transition-colors"
                  style={{ background: searchType === t ? "#726c5a" : "transparent", color: searchType === t ? "#fff" : "#9f886c" }}>
                  {t === "code" ? "Code" : t === "name" ? "ชื่อ" : "เบอร์"}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-3">
              <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchCustomer()}
                placeholder={searchType === "code" ? "C0001..." : searchType === "name" ? "ค้นหาชื่อ..." : "08X-XXX-XXXX"}
                className="flex-1 px-4 py-3 rounded-xl outline-none text-sm"
                style={{ background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" }} />
              <button onClick={handleSearchCustomer} disabled={searching || !customerQuery.trim()}
                className="px-4 py-3 rounded-xl text-sm font-medium disabled:opacity-50" style={btnStyle}>
                {searching ? "..." : "ค้นหา"}
              </button>
            </div>
            {searchError && <p className="text-sm mb-3 px-1" style={{ color: "#dc2626" }}>{searchError}</p>}
            {customerInfo && customerInfo.id && (
              <div className="p-4 rounded-xl mb-4 space-y-1" style={{ background: "#f5f2ee" }}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm" style={{ color: "#4c4847" }}>{customerInfo.fullName}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#e6e5d8", color: "#726c5a" }}>{customerInfo.title}</span>
                </div>
                <p className="text-xs" style={{ color: "#9f886c" }}>🏢 {customerInfo.company}</p>
                <p className="text-xs font-mono" style={{ color: "#726c5a" }}>🏷️ {customerInfo.customerCode} · 📞 {customerInfo.phone}</p>
              </div>
            )}
            {customerInfo && preloadName && !customerInfo.id && (
              <div className="p-4 rounded-xl mb-4 space-y-1" style={{ background: "#f5f2ee" }}>
                <p className="font-semibold text-sm" style={{ color: "#4c4847" }}>{customerInfo.fullName}</p>
                <p className="text-xs font-mono" style={{ color: "#726c5a" }}>🏷️ {customerInfo.customerCode}</p>
              </div>
            )}
            {error && <p className="text-sm mb-3" style={{ color: "#dc2626" }}>{error}</p>}
            {loading ? (
              <div className="flex items-center justify-center py-3">
                <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "#726c5a", borderTopColor: "transparent" }} />
                <span className="ml-2 text-sm" style={{ color: "#9f886c" }}>กำลังเริ่ม session...</span>
              </div>
            ) : (
              <button onClick={handleStartSession} disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-medium" style={btnStyle}>
                Start Session
              </button>
            )}
          </div>
        </div>
      ) : (
        /* ── Active Session ── */
        <div className="space-y-4">
          {/* Session info bar */}
          <div className="flex items-center gap-4 p-4 rounded-xl"
            style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
            <div className="flex-1">
              <p className="text-xs" style={{ color: "#9f886c" }}>Customer</p>
              <p className="text-base font-semibold" style={{ color: "#4c4847" }}>
                {customerInfo?.fullName ? `${customerInfo.fullName} (${session.customerCode})` : session.customerCode}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: "#9f886c" }}>Total Scans</p>
              <p className="text-base font-semibold" style={{ color: "#726c5a" }}>{session.scans.length}</p>
            </div>
          </div>

          {/* ── WebSocket Connection + Simulator ── */}
          <div className="rounded-xl overflow-hidden mb-4" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e6e5d8", background: "#f5f2ee" }}>
              <p className="text-sm font-medium" style={{ color: "#4c4847" }}>RFID Connection</p>
              <div className="flex items-center gap-2">
                {ws.isConnected && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                <span className="text-xs" style={{ color: ws.isConnected ? "#10b981" : "#9f886c" }}>
                  {ws.isConnected ? "เชื่อมต่อแล้ว" : ws.error || "ยังไม่ได้เชื่อมต่อ"}
                </span>
              </div>
            </div>
            <div className="p-4 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "#9f886c" }}>
                <span>Reader</span>
                <input
                  value={deviceIps[wsDeviceId]}
                  onChange={(e) => setDeviceIps((p) => ({ ...p, [wsDeviceId]: e.target.value }))}
                  placeholder="192.168.1.104 หรือ wss://xxx.ngrok-free.app"
                  className="px-2 py-1.5 rounded-lg outline-none w-72"
                  style={{ background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" }} />
              </div>
              {!ws.isConnected ? (
                <button onClick={ws.connect} disabled={!deviceIps[wsDeviceId]}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: deviceIps[wsDeviceId] ? "#4a6fa5" : "#cdc3ad" }}>
                  เชื่อมต่อ WebSocket
                </button>
              ) : (
                <button onClick={ws.disconnect}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "#fff0f0", color: "#9f4a4a", border: "1px solid #f5c0c0" }}>
                  ตัดการเชื่อมต่อ
                </button>
              )}
              <div className="border-l pl-3 ml-1" style={{ borderColor: "#e6e5d8" }}>
                <button onClick={runSimulator} disabled={simulating || productMap.size === 0}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: simulating ? "#cdc3ad" : "#726c5a" }}>
                  {simulating ? "กำลังจำลอง..." : `จำลองการสแกน (Fix Reader burst 3000)`}
                </button>
              </div>
              <span className="text-xs ml-auto" style={{ color: "#cdc3ad" }}>
                สินค้าในระบบ: {productMap.size} รายการ
              </span>
            </div>
          </div>

          {/* ── Device Panels ── */}
          <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e6e5d8", background: "#f5f2ee" }}>
              <p className="text-sm font-medium" style={{ color: "#4c4847" }}>เครื่อง Scanner</p>
              <p className="text-xs" style={{ color: "#9f886c" }}>เลือกเครื่องที่ต้องการเชื่อมต่อ (รองรับหลายเครื่องพร้อมกัน)</p>
            </div>
            <div className="p-4 grid grid-cols-4 gap-3">
              {DEVICES.map((d) => {
                const c = DEVICE_COLORS[d];
                const connected = connectedDevices.has(d);
                const scanCount = session.scans.filter((s) => s.deviceId === d).length;
                const lastLog = deviceLogs.find((l) => l.deviceId === d);
                return (
                  <div key={d} className="rounded-xl overflow-hidden transition-all"
                    style={{
                      border: `2px solid ${connected ? c.border : "#e6e5d8"}`,
                      background: connected ? c.bg : "#fafaf9",
                    }}>
                    {/* Device header */}
                    <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${connected ? c.border : "#e6e5d8"}` }}>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md text-xs font-bold flex items-center justify-center text-white"
                          style={{ background: connected ? c.badge : "#cdc3ad" }}>
                          {d}
                        </span>
                        <span className="text-xs font-semibold" style={{ color: connected ? c.text : "#cdc3ad" }}>
                          เครื่อง {d}
                        </span>
                      </div>
                      <button onClick={() => toggleDevice(d)}
                        className="text-xs px-2 py-0.5 rounded-full transition-all"
                        style={{
                          background: connected ? c.badge : "#e6e5d8",
                          color: connected ? "#fff" : "#9f886c",
                        }}>
                        {connected ? "เชื่อมอยู่" : "เชื่อม"}
                      </button>
                    </div>

                    {connected ? (
                      <div className="p-3 space-y-2">
                        {/* Scan count */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: c.text }}>สแกนแล้ว</span>
                          <span className="text-sm font-bold" style={{ color: c.badge }}>{scanCount}</span>
                        </div>
                        {/* Input */}
                        <input
                          ref={(el) => { rfidRefs.current[d] = el; }}
                          value={rfidInputs[d]}
                          onChange={(e) => setRfidInputs((p) => ({ ...p, [d]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") submitScan(rfidInputs[d], d); }}
                          placeholder="RFID tag..."
                          className="w-full px-2.5 py-2 rounded-lg outline-none text-xs"
                          style={{ background: "#fff", border: `1px solid ${c.border}`, color: "#4c4847" }} />
                        <button onClick={() => submitScan(rfidInputs[d], d)}
                          className="w-full py-1.5 rounded-lg text-xs font-medium text-white"
                          style={{ background: c.badge }}>
                          Scan
                        </button>
                        {/* Last activity */}
                        {lastLog && (
                          <p className="text-xs truncate" style={{ color: lastLog.ok ? c.text : "#dc2626" }}>
                            {lastLog.ok ? "✓" : "✗"} {lastLog.productName || lastLog.tag}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 text-center">
                        <p className="text-xs" style={{ color: "#cdc3ad" }}>ไม่ได้เชื่อมต่อ</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl text-sm"
              style={{ background: "#fff0f0", color: "#9f4a4a", border: "1px solid #f5c0c0" }}>
              {error}
            </div>
          )}

          {/* ── Device Log Panel (collapsible) ── */}
          {showLogs && (
            <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e6e5d8", background: "#f5f2ee" }}>
                <p className="text-sm font-medium" style={{ color: "#4c4847" }}>Device Log</p>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg overflow-hidden" style={{ background: "#e6e5d8" }}>
                    {(["all", ...DEVICES] as ("all" | DeviceId)[]).map((f) => (
                      <button key={f} onClick={() => setLogFilter(f)}
                        className="px-3 py-1 text-xs font-medium"
                        style={{
                          background: logFilter === f ? "#726c5a" : "transparent",
                          color: logFilter === f ? "#fff" : "#9f886c",
                        }}>
                        {f === "all" ? "ทั้งหมด" : `เครื่อง ${f}`}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setDeviceLogs([])} className="text-xs px-2 py-1 rounded-lg"
                    style={{ background: "#f5f2ee", color: "#9f886c" }}>ล้าง</button>
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {filteredLogs.length === 0 ? (
                  <p className="text-center py-8 text-sm" style={{ color: "#cdc3ad" }}>ยังไม่มี log</p>
                ) : filteredLogs.map((log, i) => {
                  const c = DEVICE_COLORS[log.deviceId];
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5"
                      style={{ borderBottom: i < filteredLogs.length - 1 ? "1px solid #f5f2ee" : "none" }}>
                      <span className="w-5 h-5 rounded text-xs font-bold flex items-center justify-center text-white flex-shrink-0"
                        style={{ background: c.badge }}>
                        {log.deviceId}
                      </span>
                      <span className="text-xs flex-shrink-0" style={{ color: "#9f886c" }}>{log.time}</span>
                      <span className="text-xs font-mono flex-shrink-0" style={{ color: "#cdc3ad" }}>{log.tag}</span>
                      <span className={`text-xs flex-1 ${log.ok ? "" : "text-red-500"}`}
                        style={{ color: log.ok ? "#4c4847" : "#dc2626" }}>
                        {log.ok ? log.productName : "❌ ไม่พบสินค้า"}
                      </span>
                      <span className="text-xs" style={{ color: log.ok ? "#10b981" : "#dc2626" }}>
                        {log.ok ? "✓" : "✗"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Scan List ── */}
          <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
            {/* Tabs */}
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #e6e5d8", background: "#f5f2ee" }}>
              <div className="flex items-center gap-1">
                {(["all", ...DEVICES] as ("all" | DeviceId)[]).map((t) => {
                  const count = t === "all" ? session.scans.length : session.scans.filter((s) => s.deviceId === t).length;
                  const connected = t === "all" || connectedDevices.has(t as DeviceId);
                  const c = t !== "all" ? DEVICE_COLORS[t as number] : null;
                  return (
                    <button key={t} onClick={() => setActiveTab(t)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: activeTab === t ? (c ? c.badge : "#726c5a") : "transparent",
                        color: activeTab === t ? "#fff" : connected ? (c ? c.text : "#726c5a") : "#cdc3ad",
                        opacity: connected ? 1 : 0.5,
                      }}>
                      {t === "all" ? "ทั้งหมด" : `เครื่อง ${t}`}
                      <span className="px-1.5 py-0.5 rounded-full text-xs"
                        style={{ background: activeTab === t ? "rgba(255,255,255,0.25)" : "#e6e5d8", color: activeTab === t ? "#fff" : "#9f886c" }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              {visibleScans.some((s) => s.prepareStatus === "NONE") && (
                <button onClick={() => visibleScans.filter((s) => s.prepareStatus === "NONE").forEach((s) => handlePrepare(s))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "#726c5a", color: "#fff" }}>
                  เตรียมทั้งหมด
                </button>
              )}
            </div>

            {visibleScans.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-sm" style={{ color: "#cdc3ad" }}>
                  {activeTab === "all" ? "No items scanned yet" : `เครื่อง ${activeTab} ยังไม่มีรายการ`}
                </p>
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e6e5d8", background: "#f5f2ee" }}>
                      {["เครื่อง","Image","Code","Name","Location","Material","Category","Status","Takeaway","Action"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap text-xs"
                          style={{ color: "#9f886c" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleScans.map((scan) => {
                      const sCfg = STATUS_STYLE[scan.prepareStatus];
                      const dc = DEVICE_COLORS[scan.deviceId];
                      return (
                        <tr key={scan.id} style={{ borderBottom: "1px solid #f5f2ee" }}>
                          {/* Device badge */}
                          <td className="px-4 py-3">
                            <span className="w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center text-white"
                              style={{ background: dc.badge }}>
                              {scan.deviceId}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {scan.product.imageUrl ? (
                              <img src={scan.product.imageUrl} alt={scan.product.name}
                                className="w-14 h-11 object-cover rounded-lg"
                                style={{ border: "1px solid #e6e5d8" }} />
                            ) : (
                              <div className="w-14 h-11 rounded-lg flex items-center justify-center"
                                style={{ background: "#f5f2ee", border: "1px solid #e6e5d8" }}>
                                <svg width="14" height="14" fill="none" stroke="#cdc3ad" strokeWidth="1.5" viewBox="0 0 24 24">
                                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                                  <circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
                                </svg>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "#9f886c" }}>
                            {scan.product.productCode || "-"}
                          </td>
                          <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: "#4c4847" }}>
                            {scan.product.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {scan.product.location ? (
                              <span className="flex items-center gap-1 text-xs font-mono" style={{ color: "#726c5a" }}>
                                📍 {scan.product.location}
                              </span>
                            ) : <span className="text-xs" style={{ color: "#cdc3ad" }}>-</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "#9f886c" }}>
                            {scan.product.materialType || "-"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "#9f886c" }}>
                            {scan.product.category || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {scan.prepareStatus !== "NONE" ? (
                              <span className="px-2 py-1 rounded-full text-xs font-medium"
                                style={{ background: sCfg.bg, color: sCfg.color }}>
                                {sCfg.label}
                              </span>
                            ) : <span className="text-xs" style={{ color: "#cdc3ad" }}>-</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => changeTakeaway(scan.id, -1)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                                style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}>−</button>
                              <span className="w-7 text-center text-sm font-medium" style={{ color: "#4c4847" }}>
                                {takeaway[scan.id] ?? 0}
                              </span>
                              <button onClick={() => changeTakeaway(scan.id, 1)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                                style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}>+</button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {scan.prepareStatus === "NONE" && (
                              <button onClick={() => handlePrepare(scan)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                                style={{ background: "#dbeafe", color: "#3b82f6" }}>
                                🔔 เตรียมสินค้า
                              </button>
                            )}
                            {scan.prepareStatus === "PREPARING" && (
                              <button onClick={() => handleMarkComplete(scan.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                                style={{ background: "#d1fae5", color: "#10b981" }}>
                                ✓ เสร็จสิ้น
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RFIDPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "#726c5a", borderTopColor: "transparent" }} /></div>}>
      <RFIDPageInner />
    </Suspense>
  );
}