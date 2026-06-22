"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useWebSocket } from "@/hooks/useWebSocket";
import { getDeviceId } from "@/lib/deviceId";
import { supabaseBrowser, DISPLAY_CHANNEL, DISPLAY_EVENT } from "@/lib/supabaseBrowser";

// A transient warning toast — fixed top-right (via the app-wide Toaster), so it's visible
// even when the user has scrolled down the scan list (an inline error would be off-screen).
const warn = (msg: string) =>
  toast(msg, { icon: "⚠️", duration: 3000, style: { background: "#9f4a4a", color: "#fff", border: "none", borderRadius: "0.75rem" } });

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
  // When set, a physical reader is bound to this session and the SERVER persists its
  // scans (relay → /api/scan). The browser then shows scans live but does NOT POST them,
  // so there's no double-write. Empty = local/direct mode where the browser persists.
  readerId?: string | null;
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

// A relay subscriber URL may pin one reader as `?device=<device_id>`. If present, that
// device_id is the reader we bind to the session so the SERVER ingests its scans
// (/api/scan). No ?device (broadcast) or a direct LAN ws:// URL → empty → browser-persist.
function readerIdFromUrl(url: string): string {
  if (!url) return "";
  try { return (new URL(url).searchParams.get("device") || "").trim(); } catch { return ""; }
}

// Quick-pick readers for the connection field, so staff select instead of typing a URL.
// `device` is the relay tag (matches the pusher's ?device=<tag>); the relay base is filled in
// from Settings (prod, wss) or the same host on :8081 (local, ws).
const READER_PRESETS: { label: string; device: string }[] = [
  { label: "Bluetooth (handheld)", device: "handheld" },
  { label: "โต๊ะ (table reader)", device: "table" },
];

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
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session; // latest session for callbacks (id reconcile reads this)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Devices — which ones are connected
  const [connectedDevices, setConnectedDevices] = useState<Set<DeviceId>>(new Set([1]));
  const [activeTab, setActiveTab] = useState<"all" | DeviceId>("all");

  // Logs
  const [deviceLogs, setDeviceLogs] = useState<DeviceLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<"all" | DeviceId>("all");

  // Misc
  const [takeaway, setTakeaway] = useState<Record<string, number>>({});
  const [takeawayLimit, setTakeawayLimit] = useState(3);       // max takeaway pieces per session
  const [takeawayEnabled, setTakeawayEnabled] = useState(true); // whether the limit is enforced
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [displayedId, setDisplayedId] = useState<string | null>(null); // session id currently on the TV

  // ── WebSocket + Pre-loaded Map + Dedup + Batch ──────────────────────────
  const [productMap, setProductMap] = useState<Map<string, Product>>(new Map());
  const seenEpcsRef = useRef<Set<string>>(new Set());
  const scanQueueRef = useRef<Array<{ productId: string; rfidTag: string }>>([]);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [deviceIps, setDeviceIps] = useState<Record<number, string>>({ 1: "", 2: "", 3: "", 4: "" });
  const [wsDeviceId, setWsDeviceId] = useState<DeviceId>(1);
  const [relayBase, setRelayBase] = useState(""); // relay base for the reader quick-pick
  const [relayDevices, setRelayDevices] = useState<string[]>([]); // readers currently pushing to the relay
  const [simulating, setSimulating] = useState(false);

  // Station id (Option C ownership key): a silent, persisted per-device id used to keep
  // concurrent stations' sessions separate (getDeviceId() reads/creates it in localStorage).

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

  // Load the takeaway limit/toggle so changeTakeaway can enforce it.
  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d?.takeawayLimit !== undefined) setTakeawayLimit(d.takeawayLimit);
      if (d?.takeawayEnabled !== undefined) setTakeawayEnabled(d.takeawayEnabled);
    }).catch(() => {});
  }, []);

  // Resolve the relay base for the reader quick-pick: on HTTPS use the configured relay
  // (must be wss); on local HTTP use the same host on :8081 (avoids a stale configured URL).
  useEffect(() => {
    fetch("/api/display/config").then((r) => r.json()).then((c) => {
      const cfg = String(c?.relayUrl || "").replace(/\/+$/, "");
      if (typeof window === "undefined") { setRelayBase(cfg); return; }
      setRelayBase(window.location.protocol === "https:" ? cfg : `ws://${window.location.hostname}:8081`);
    }).catch(() => {});
  }, []);

  // Poll the relay for readers currently pushing, so the picker shows live devices (not just
  // the static presets). ws→http / wss→https for the relay's HTTP /devices endpoint.
  useEffect(() => {
    if (!relayBase) return;
    const httpBase = relayBase.replace(/^ws/, "http"); // ws→http, wss→https
    let stopped = false;
    const poll = () => fetch(`${httpBase}/devices`)
      .then((r) => r.json())
      .then((d) => { if (!stopped) setRelayDevices(Array.isArray(d?.devices) ? d.devices.map((x: { id: string }) => x.id) : []); })
      .catch(() => {});
    poll();
    const t = setInterval(poll, 4000);
    return () => { stopped = true; clearInterval(t); };
  }, [relayBase]);

  // Quick-pick a reader → fill the connection field with the relay subscriber URL (no typing).
  function pickReader(device: string) {
    if (!device) return;
    const base = relayBase || (typeof window !== "undefined" ? `ws://${window.location.hostname}:8081` : "");
    if (!base) return;
    setDeviceIps((p) => ({ ...p, [wsDeviceId]: `${base}/?device=${encodeURIComponent(device)}` }));
  }

  // Swap optimistic "ws-" scan ids for the server's real ids (matched by productId) once a
  // batch is persisted, and migrate the takeaway-map keys so the displayed qty doesn't blip.
  // Keeps the UI's ids aligned with the DB so id-based merges (prep-status poll) work.
  const reconcileScanIds = useCallback((serverScans: { id: string; productId: string }[]) => {
    const realByProduct = new Map(serverScans.map((s) => [s.productId, s.id]));
    const cur = sessionRef.current;
    if (!cur) return;
    const remap = new Map<string, string>();
    for (const s of cur.scans) {
      if (s.id.startsWith("ws-")) {
        const real = realByProduct.get(s.product.id);
        if (real && real !== s.id) remap.set(s.id, real);
      }
    }
    if (remap.size === 0) return;
    setSession((p) => {
      if (!p) return p;
      const seen = new Set<string>();
      // remap ws- ids → real ids, then drop any duplicate id (a remap can land on an id
      // that's already in the list); keep the first (newest) occurrence.
      const scans = p.scans
        .map((s) => (remap.has(s.id) ? { ...s, id: remap.get(s.id)! } : s))
        .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
      return { ...p, scans };
    });
    setTakeaway((tk) => {
      const next: Record<string, number> = {};
      for (const [id, q] of Object.entries(tk)) next[remap.get(id) ?? id] = q;
      return next;
    });
  }, []);

  const flushScans = useCallback(async () => {
    const batch = [...scanQueueRef.current];
    scanQueueRef.current = [];
    flushTimerRef.current = null;
    if (batch.length === 0 || !session) return;
    try {
      const res = await fetch(`/api/sessions/${session.id}/scans/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scans: batch }),
      });
      const data = await res.json().catch(() => null);
      if (data?.scans) reconcileScanIds(data.scans); // align optimistic ids with the DB
    } catch {
      scanQueueRef.current.unshift(...batch);
      flushTimerRef.current = setTimeout(flushScans, 2000);
    }
  }, [session, reconcileScanIds]);

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
    // One scan per product — the DB is unique on (session, product), so two tags that
    // resolve to the same product must not become two rows (they'd later collapse to the
    // same id → duplicate React key). Skip if this product is already in the list.
    setSession((p) => {
      if (!p) return p;
      if (p.scans.some((s) => s.product.id === product.id)) return p;
      return { ...p, scans: [fakeScan, ...p.scans] };
    });

    // Always persist from the browser. (Server-side ingest via /api/scan only attributes
    // when the scan's device_id matches the session's readerId; readers that send a generic
    // device_id — e.g. "UNKNOWN" — would otherwise lose every scan. The DB upsert is
    // idempotent, so a server ingest that DOES match is harmless.)
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

  // Bind the connected reader to the active session. The reader picker only appears AFTER
  // the session is active, so readerId can't be captured at start — we set it on connect so
  // the reader shows "in use". Re-attempts on every (re)connect (self-heals a dropped socket).
  // Needs a relay ?device= reader — a bare/direct connection has no id to track.
  useEffect(() => {
    if (!ws.isConnected || !session?.id) return;
    const rid = readerIdFromUrl(deviceIps[wsDeviceId] || "");
    if (!rid || session.readerId === rid) return;
    fetch(`/api/sessions/${session.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readerId: rid }),
    }).then((r) => { if (r.ok) setSession((p) => (p ? { ...p, readerId: rid } : p)); }).catch(() => {});
  }, [ws.isConnected, session?.id, session?.readerId, deviceIps, wsDeviceId]);

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

  // Server-persist mode: the server (relay → /api/scan) owns persistence, so the staff
  // view must reconcile with the DB to get REAL scan ids (prepare/takeaway PATCH by id)
  // and pick up scans that arrived while this tab wasn't the one scanning. Refetch on the
  // same realtime nudge the TV uses. No-op in local mode (no readerId, browser persists).
  const serverPersist = !!session?.readerId;
  useEffect(() => {
    if (!serverPersist || !supabaseBrowser) return;
    const refetch = () => {
      fetch(`/api/sessions?deviceId=${encodeURIComponent(getDeviceId())}`)
        .then((r) => r.json())
        .then((data) => { if (data?.id) applyLoadedSession(data); })
        .catch(() => { /* fallback: next nudge reconciles */ });
    };
    const channel = supabaseBrowser.channel(`${DISPLAY_CHANNEL}-rfid`);
    channel.on("broadcast", { event: DISPLAY_EVENT }, refetch).subscribe();
    return () => { if (supabaseBrowser) supabaseBrowser.removeChannel(channel); };
  }, [serverPersist]);

  // Track which session is on the TV ("Stop Display") AND which readers are in use by a
  // customer. Both change on session start/send/stop, which broadcast on DISPLAY_CHANNEL.
  const [busyReaders, setBusyReaders] = useState<Record<string, { customerCode: string; customerName: string }>>({});
  const refreshDisplayed = useCallback(() => {
    fetch("/api/sessions/display").then((r) => r.json()).then((d) => setDisplayedId(d?.id ?? null)).catch(() => {});
  }, []);
  const refreshReaders = useCallback(() => {
    fetch("/api/readers").then((r) => r.json()).then((d) => {
      const map: Record<string, { customerCode: string; customerName: string }> = {};
      (d?.readers || []).forEach((x: { readerId: string; customerCode: string; customerName: string }) => {
        map[x.readerId] = { customerCode: x.customerCode, customerName: x.customerName };
      });
      setBusyReaders(map);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    const sync = () => { refreshDisplayed(); refreshReaders(); };
    sync();
    const t = setInterval(sync, 10000); // fallback poll (occupancy + displayed session)
    if (!supabaseBrowser) return () => clearInterval(t);
    // Same topic as the broadcast (DISPLAY_CHANNEL) — a suffixed name is a different topic.
    const channel = supabaseBrowser.channel(DISPLAY_CHANNEL);
    channel.on("broadcast", { event: DISPLAY_EVENT }, sync).subscribe();
    return () => { clearInterval(t); if (supabaseBrowser) supabaseBrowser.removeChannel(channel); };
  }, [refreshDisplayed, refreshReaders]);

  // Reflect prep-staff progress (กำลังเตรียม / พร้อมแล้ว) on the scan page. Gentle poll that
  // MERGES prepareStatus/takeawayQty into existing scans by id — never replaces the list, so
  // just-scanned (optimistic) items aren't dropped. Only runs while something is being
  // prepared (no idle polling → lighter on the DB connection pool).
  const hasPreparingScan = session?.scans.some((s) => s.prepareStatus === "PREPARING") ?? false;
  useEffect(() => {
    if (!session?.id || !hasPreparingScan) return;
    const sid = session.id;
    const t = setInterval(() => {
      fetch(`/api/sessions?deviceId=${encodeURIComponent(getDeviceId())}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.id !== sid) return;
          const byId = new Map<string, ScanItem>((d.scans || []).map((s: ScanItem) => [s.id, s]));
          setSession((p) => {
            if (!p || p.id !== sid) return p;
            return { ...p, scans: p.scans.map((s) => {
              const fresh = byId.get(s.id);
              return fresh ? { ...s, prepareStatus: fresh.prepareStatus, takeawayQty: fresh.takeawayQty } : s;
            }) };
          });
        }).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [session?.id, hasPreparingScan]);

  async function handleStartSessionWith(code: string, custId: string | null) {
    setLoading(true); setError("");
    try {
      // If a reader is pinned via the relay (?device=<device_id>), bind it so the server
      // attributes its scans to this session. Empty for direct LAN → browser persists.
      const readerId = readerIdFromUrl(deviceIps[wsDeviceId] || "");
      const res = await fetch("/api/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerCode: code, customerId: custId, deviceId: getDeviceId(), readerId }),
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

  // Persist a scan's prepare status / takeaway qty (customer req #2) — previously
  // these lived only in React state and were lost on reload / unseen by other stations.
  async function patchScan(scan: ScanItem, body: { prepareStatus?: string; takeawayQty?: number }): Promise<boolean> {
    if (!session) return false;
    try {
      const res = await fetch(`/api/sessions/${session.id}/scans/${scan.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        // Send productId so the server keys on (sessionId, productId) — works even when this
        // scan is still optimistic (client "ws-" id) and not yet flushed to the DB.
        body: JSON.stringify({ ...body, productId: scan.product.id }),
      });
      return res.ok;
    } catch { return false; /* optimistic UI applied; the next session load reconciles */ }
  }

  // Hydrate session + takeaway state from the server's real (now-persisted) scan rows.
  function applyLoadedSession(data: { id?: string; scans?: ScanItem[] } & Record<string, unknown>) {
    const scans = (data.scans || []).map((s) => ({ ...s, deviceId: 1 as const }));
    setSession({ ...(data as unknown as Session), scans });
    const tk: Record<string, number> = {};
    for (const s of scans) if (s.takeawayQty) tk[s.id] = s.takeawayQty;
    setTakeaway(tk);
  }

  async function changeTakeaway(scan: ScanItem, delta: number) {
    const scanId = scan.id;
    const prev = takeaway[scanId] ?? 0;
    const next = Math.max(0, prev + delta);
    if (next === prev) return;
    // Enforce the per-session takeaway limit (total pieces across ALL scans) when increasing.
    if (takeawayEnabled && delta > 0) {
      const totalOthers = Object.entries(takeaway).reduce((sum, [id, q]) => (id === scanId ? sum : sum + q), 0);
      if (totalOthers + next > takeawayLimit) {
        warn(`Takeaway limit reached — max ${takeawayLimit} per visit`);
        return;
      }
    }
    setTakeaway((p) => ({ ...p, [scanId]: next }));
    const ok = await patchScan(scan, { takeawayQty: next });
    if (!ok) setTakeaway((p) => ({ ...p, [scanId]: prev })); // server rejected → revert
  }

  async function handlePrepare(scan: ScanItem) {
    // A prepare must say how many to prepare — require a takeaway amount first.
    if ((takeaway[scan.id] ?? 0) < 1) {
      warn("Set a takeaway amount (≥ 1) before preparing.");
      return;
    }
    setSession((p) => p ? { ...p, scans: p.scans.map((s) => s.id === scan.id ? { ...s, prepareStatus: "PREPARING" } : s) } : p);
    // The scan PATCH and the notification POST are independent writes; the UI already
    // updated optimistically above, so run them concurrently — perceived latency is the
    // slower of the two, not their sum.
    await Promise.all([
      patchScan(scan, { prepareStatus: "PREPARING" }),
      fetch("/api/notifications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: scan.product.id, customerId: session?.customerId || null,
          sessionId: session?.id, title: "เตรียมสินค้าตัวอย่าง",
          message: `${scan.product.name}${scan.product.location ? ` (${scan.product.location})` : ""}`,
        }),
      }),
    ]);
  }

  async function handleMarkComplete(scan: ScanItem) {
    setSession((p) => p ? { ...p, scans: p.scans.map((s) => s.id === scan.id ? { ...s, prepareStatus: "COMPLETE" } : s) } : p);
    await patchScan(scan, { prepareStatus: "COMPLETE" });
  }

  // Intentional disconnect (button) frees the reader for other stations; the session stays
  // active. A transient socket drop does NOT call this — it re-binds on reconnect instead.
  function handleDisconnect() {
    ws.disconnect();
    if (session?.id && session.readerId) {
      fetch(`/api/sessions/${session.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearReader: true }),
      }).then((r) => { if (r.ok) setSession((p) => (p ? { ...p, readerId: null } : p)); }).catch(() => {});
    }
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
        setDisplayedId(session.id);
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

  // Clear the TV (there's one physical screen) → /display returns to idle. Clears whatever
  // is currently shown, not just this session, so the screen reliably goes blank.
  async function handleStopDisplay() {
    try {
      await fetch("/api/sessions/display", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      setDisplayedId(null);
      setSendSuccess(false);
    } catch { /* the display's fallback poll reconciles */ }
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
          <p className="text-xs mt-1" style={{ color: "#9f886c" }}>Home / Surface Scan</p>
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
            {displayedId === session.id && (
              <button onClick={handleStopDisplay}
                className="px-4 py-2 rounded-xl text-sm"
                style={{ background: "#fff", border: "1px solid #e6e5d8", color: "#9f886c" }}>
                Stop Display
              </button>
            )}
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
              {/* Reader occupancy — which physical readers are currently serving a customer */}
              <div className="w-full text-xs flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: "#9f886c" }}>
                <span className="font-medium" style={{ color: "#4c4847" }}>Readers in use:</span>
                {Object.keys(busyReaders).length === 0 ? (
                  <span style={{ color: "#10b981" }}>none — all free</span>
                ) : (
                  Object.entries(busyReaders).map(([rid, c]) => (
                    <span key={rid} className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#dc2626" }} />
                      {rid} → {c.customerName} ({c.customerCode})
                    </span>
                  ))
                )}
              </div>
              {!ws.isConnected ? (
                <>
                  <select value="" onChange={(e) => pickReader(e.target.value)}
                    className="px-2 py-1.5 rounded-lg outline-none text-xs"
                    style={{ background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" }}>
                    <option value="">Select reader…</option>
                    {relayDevices.length > 0 && (
                      <optgroup label="Connected to relay (live)">
                        {relayDevices.map((d) => {
                          const b = busyReaders[d];
                          return <option key={"live-" + d} value={d}>{b ? `🔴 ${d} — in use (${b.customerName})` : `🟢 ${d}`}</option>;
                        })}
                      </optgroup>
                    )}
                    <optgroup label="Presets">
                      {READER_PRESETS.map((r) => {
                        const b = busyReaders[r.device];
                        return <option key={r.device} value={r.device}>{b ? `🔴 ${r.label} — in use (${b.customerName})` : r.label}</option>;
                      })}
                    </optgroup>
                  </select>
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: "#9f886c" }}>
                    <span>Reader</span>
                    <input
                      value={deviceIps[wsDeviceId]}
                      onChange={(e) => setDeviceIps((p) => ({ ...p, [wsDeviceId]: e.target.value }))}
                      placeholder="Pick a reader ↑ or type: 192.168.1.104 / wss://…"
                      className="px-2 py-1.5 rounded-lg outline-none w-72"
                      style={{ background: "#f5f2ee", border: "1px solid #e6e5d8", color: "#4c4847" }} />
                  </div>
                  <button onClick={ws.connect} disabled={!deviceIps[wsDeviceId]}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ background: deviceIps[wsDeviceId] ? "#4a6fa5" : "#cdc3ad" }}>
                    เชื่อมต่อ WebSocket
                  </button>
                </>
              ) : (
                <>
                  <span className="text-xs" style={{ color: "#9f886c" }}>Connected to</span>
                  <span className="px-2.5 py-1 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5"
                    style={{ background: "#e8f5e9", color: "#2e7d32" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    {readerIdFromUrl(deviceIps[wsDeviceId]) || "LAN (direct)"}
                  </span>
                  <span className="text-[11px]" style={{ color: "#cdc3ad" }}>{deviceIps[wsDeviceId]}</span>
                  <button onClick={handleDisconnect}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "#fff0f0", color: "#9f4a4a", border: "1px solid #f5c0c0" }}>
                    ตัดการเชื่อมต่อ
                  </button>
                </>
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
                <button onClick={() => {
                  const ready = visibleScans.filter((s) => s.prepareStatus === "NONE" && (takeaway[s.id] ?? 0) >= 1);
                  const skipped = visibleScans.filter((s) => s.prepareStatus === "NONE" && (takeaway[s.id] ?? 0) < 1).length;
                  ready.forEach((s) => handlePrepare(s));
                  if (skipped > 0) warn(`${skipped} item(s) skipped — set a takeaway amount (≥ 1) first.`);
                }}
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
                              <button onClick={() => changeTakeaway(scan, -1)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                                style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}>−</button>
                              <span className="w-7 text-center text-sm font-medium" style={{ color: "#4c4847" }}>
                                {takeaway[scan.id] ?? 0}
                              </span>
                              <button onClick={() => changeTakeaway(scan, 1)}
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
                              <button onClick={() => handleMarkComplete(scan)}
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