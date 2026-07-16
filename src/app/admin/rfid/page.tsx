"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useWebSocket } from "@/hooks/useWebSocket";
import { getDeviceId } from "@/lib/deviceId";
import { normalizeReaders, readerUrl, type SavedReader } from "@/lib/readers";
import { normalizeDisplays, type SavedDisplay } from "@/lib/displays";
import { supabaseBrowser, DISPLAY_CHANNEL, DISPLAY_EVENT } from "@/lib/supabaseBrowser";
import Link from "next/link";

// Remember the last reader URL for this station so it isn't re-typed every reload.
const STATION_READER_KEY = "tak-station-reader-url";

// A transient warning toast — fixed top-right (via the app-wide Toaster), so it's visible
// even when the user has scrolled down the scan list (an inline error would be off-screen).
const warn = (msg: string) =>
  toast(msg, { icon: "⚠️", duration: 3000, style: { background: "var(--color-danger-soft)", color: "var(--color-surface)", border: "none", borderRadius: "0.75rem" } });

// ── Types ──────────────────────────────────────────────────────────────────
interface Product {
  id: string; name: string; brand: string | null; productCode: string | null;
  materialType: string | null; category: string | null; imageUrl: string | null;
  location: string | null; returnable?: boolean; // image3: false = give-away (no prepare/return)
}
interface ScanItem {
  id: string; scannedAt: string; product: Product;
  prepareStatus: "NONE" | "PREPARING" | "COMPLETE";
  takeawayQty?: number;
  deviceId: number; // 1-4
}
interface Session {
  id: string; customerCode: string; customerId: string | null; scans: ScanItem[]; contactName?: string | null;
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

const STATUS_STYLE = {
  NONE:      { label: "",             bg: "transparent", color: "var(--color-text-subtle)" },
  PREPARING: { label: "กำลังเตรียม", bg: "#dbeafe",    color: "#3b82f6" },
  COMPLETE:  { label: "พร้อมแล้ว",   bg: "#d1fae5",    color: "var(--color-success)" },
};

// A relay subscriber URL may pin one reader as `?device=<device_id>`. If present, that
// device_id is the reader we bind to the session so the SERVER ingests its scans
// (/api/scan). No ?device (broadcast) or a direct LAN ws:// URL → empty → browser-persist.
function readerIdFromUrl(url: string): string {
  if (!url) return "";
  try { return (new URL(url).searchParams.get("device") || "").trim(); } catch { return ""; }
}

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

  // One station = one reader; connectedDevices stays {1} (the 1–4 multi-device UI was removed).
  const [connectedDevices, setConnectedDevices] = useState<Set<DeviceId>>(new Set([1]));

  // Logs
  const [deviceLogs, setDeviceLogs] = useState<DeviceLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [unknownTags, setUnknownTags] = useState<string[]>([]); // scanned EPCs with no matching product

  // Misc
  const [takeaway, setTakeaway] = useState<Record<string, number>>({});
  const [takeawayLimit, setTakeawayLimit] = useState(3);       // max takeaway pieces per session
  const [takeawayEnabled, setTakeawayEnabled] = useState(true); // whether the limit is enforced
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [displayedId, setDisplayedId] = useState<string | null>(null); // session id currently on a TV
  const [displays, setDisplays] = useState<SavedDisplay[]>([]); // TV screen registry (from Settings)
  const [targetDisplay, setTargetDisplay] = useState(""); // which screen "Send to Display" targets ("" = default screen)

  // ── WebSocket + Pre-loaded Map + Dedup + Batch ──────────────────────────
  const [productMap, setProductMap] = useState<Map<string, Product>>(new Map());
  const seenEpcsRef = useRef<Set<string>>(new Set());
  const scanQueueRef = useRef<Array<{ productId: string; rfidTag: string }>>([]);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [deviceIps, setDeviceIps] = useState<Record<number, string>>({ 1: "", 2: "", 3: "", 4: "" });
  const [wsDeviceId, setWsDeviceId] = useState<DeviceId>(1);
  const [relayBase, setRelayBase] = useState(""); // relay base for the reader quick-pick
  const [relayDevices, setRelayDevices] = useState<string[]>([]); // readers currently pushing to the relay
  const [savedReaders, setSavedReaders] = useState<SavedReader[]>([]); // central registry (from Settings)
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
      setSavedReaders(normalizeReaders(c?.readers));
      setDisplays(normalizeDisplays(c?.displays));
      const cfg = String(c?.relayUrl || "").replace(/\/+$/, "");
      if (typeof window === "undefined") { setRelayBase(cfg); return; }
      setRelayBase(window.location.protocol === "https:" ? cfg : `ws://${window.location.hostname}:8081`);
    }).catch(() => {});
  }, []);

  // Restore this station's last reader URL once on mount, then persist it on change — so
  // staff don't re-enter the address every reload (it was previously React-state only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STATION_READER_KEY);
    if (saved) setDeviceIps((p) => ({ ...p, 1: saved }));
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = deviceIps[wsDeviceId];
    if (u) window.localStorage.setItem(STATION_READER_KEY, u);
  }, [deviceIps, wsDeviceId]);

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

    if (!product) {
      setUnknownTags((t) => (t.includes(epc) ? t : [epc, ...t])); // surface tags not in the system
      return;
    }

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
          // Resolve the customer so the contact picker can be offered before starting. If they
          // have extra contacts, show the Start screen with the picker (don't auto-start); with
          // no contacts, keep the one-click auto-start.
          fetch(`/api/customers/search?q=${encodeURIComponent(preloadCode)}&type=code`)
            .then((r) => r.json())
            .then(async (cust) => {
              if (cust?.id) {
                const cs = await fetch(`/api/customers/${cust.id}/contacts`).then((r) => r.json()).catch(() => []);
                if (Array.isArray(cs) && cs.length > 0) {
                  setCustomerInfo(cust); setContacts(cs); setContactName("");
                  return; // wait for staff to pick a contact + press Start
                }
              }
              handleStartSessionWith(preloadCode, cust?.id || null);
            })
            .catch(() => handleStartSessionWith(preloadCode, null));
        }
      });
    } else {
      fetch(url).then((r) => r.json()).then((data) => {
        // Use the real persisted prepareStatus/takeawayQty (was forcing "NONE"/0 here,
        // so a plain page reload silently reverted every prepared/takeaway item).
        if (data?.id) applyLoadedSession(data);
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

  // Auto-target the screen bound to this session's reader. session.readerId is a device tag,
  // so map it device → registry reader → display; fall back to the first configured screen.
  // Staff can still override via the picker; this just re-seeds it when the binding changes.
  const autoDisplay = useMemo(() => {
    if (displays.length === 0) return "";
    const rid = session?.readerId;
    if (rid) {
      const reg = savedReaders.find((r) => r.device && r.device === rid);
      const matched = reg ? displays.find((d) => d.readerId && d.readerId === reg.id) : undefined;
      if (matched) return matched.id;
    }
    return displays[0].id;
  }, [displays, savedReaders, session?.readerId]);
  // Re-seed the picker from the auto target ONLY until staff manually pick — otherwise an
  // async reader (re)bind (readerId is set on ws-connect, after the session starts) would
  // silently overwrite their choice and send the list to the wrong screen. Reset per session.
  const userPickedDisplay = useRef(false);
  useEffect(() => { if (!userPickedDisplay.current) setTargetDisplay(autoDisplay); }, [autoDisplay]);
  useEffect(() => { userPickedDisplay.current = false; }, [session?.id]);

  const refreshDisplayed = useCallback(() => {
    const sid = session?.id;
    if (!sid) { setDisplayedId(null); return; }
    // Is THIS session currently live on a screen? (correct across reloads / other stations)
    fetch(`/api/sessions/display?session=${encodeURIComponent(sid)}`)
      .then((r) => r.json()).then((d) => setDisplayedId(d?.id ?? null)).catch(() => {});
  }, [session?.id]);
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

  async function handleStartSessionWith(code: string, custId: string | null, contact?: string) {
    setLoading(true); setError("");
    try {
      // If a reader is pinned via the relay (?device=<device_id>), bind it so the server
      // attributes its scans to this session. Empty for direct LAN → browser persists.
      const readerId = readerIdFromUrl(deviceIps[wsDeviceId] || "");
      const res = await fetch("/api/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerCode: code, customerId: custId, contactName: contact || undefined, deviceId: getDeviceId(), readerId }),
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

  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]); // #8
  const [contactName, setContactName] = useState("");
  const searchSeqRef = useRef(0); // ignore a stale contacts fetch that resolves after a newer search

  async function handleSearchCustomer() {
    if (!customerQuery.trim()) return;
    setSearching(true); setSearchError(""); setCustomerInfo(null); setContacts([]); setContactName("");
    const seq = ++searchSeqRef.current;
    const res = await fetch(`/api/customers/search?q=${encodeURIComponent(customerQuery.trim())}&type=${searchType}`);
    const data = await res.json();
    if (searchSeqRef.current !== seq) return; // superseded by a newer search
    if (data?.id) {
      setCustomerInfo(data);
      setContactName(""); // "" = primary contact; only set when staff pick an extra contact
      fetch(`/api/customers/${data.id}/contacts`).then((r) => r.json())
        .then((cs) => { if (searchSeqRef.current === seq) setContacts(Array.isArray(cs) ? cs : []); }).catch(() => {});
    } else setSearchError("ไม่พบข้อมูลสมาชิก");
    setSearching(false);
  }

  async function handleStartSession() {
    const code = customerInfo?.customerCode || customerQuery.trim();
    if (!code) { setError("กรุณาระบุ Customer ID"); return; }
    await handleStartSessionWith(code, customerInfo?.id || null, contactName);
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
    // image3: give-away items are handed over as-is — no prepare/notification.
    if (scan.product.returnable === false) {
      warn("สินค้าให้ไปเลย — ไม่ต้องเตรียม/แจ้งเตือน");
      return;
    }
    setSession((p) => p ? { ...p, scans: p.scans.map((s) => s.id === scan.id ? { ...s, prepareStatus: "PREPARING" } : s) } : p);
    // The scan PATCH and the notification POST are independent writes; the UI already
    // updated optimistically above, so run them concurrently — perceived latency is the
    // slower of the two, not their sum.
    const [, notifRes] = await Promise.all([
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
    // image3 safety: if the server skipped the alert (product is give-away — e.g. flipped to
    // give-away after this station loaded), don't leave the scan stuck PREPARING with no alert.
    const skipped = await notifRes.json().then((d) => d?.skipped).catch(() => false);
    if (skipped) {
      setSession((p) => p ? { ...p, scans: p.scans.map((s) => s.id === scan.id ? { ...s, prepareStatus: "NONE" } : s) } : p);
      await patchScan(scan, { prepareStatus: "NONE" });
      warn("สินค้าให้ไปเลย — ไม่ต้องเตรียม/แจ้งเตือน");
    }
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

  // Name a live/picked relay device and append it to the central registry (Settings).
  // Re-reads the authoritative list first so a concurrent edit isn't clobbered.
  async function saveLiveReader(device: string) {
    if (!device) return;
    const name = window.prompt(`Save reader "${device}" — name it:`, device);
    if (name === null) return; // cancelled
    try {
      const cur = await fetch("/api/settings").then((r) => r.json()).catch(() => ({}));
      const list = normalizeReaders(cur?.readers);
      if (list.some((r) => r.device === device)) { setSavedReaders(list); return; } // already saved elsewhere
      const id = (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(16).slice(2)).slice(0, 8);
      const next = [...list, { id, name: name.trim() || device, device, url: "" }];
      const saved = await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ readers: next }),
      }).then((r) => r.json());
      setSavedReaders(normalizeReaders(saved?.readers ?? next));
      toast(`Saved "${name.trim() || device}" to readers`, { icon: "💾", duration: 2500, style: { background: "#4a7c59", color: "var(--color-surface)", border: "none", borderRadius: "0.75rem" } });
    } catch { warn("Couldn't save the reader — try again."); }
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
    setSession(null); setCustomerQuery(""); setCustomerInfo(null); setContactName(""); setContacts([]);
    setSearchError(""); setError(""); setTakeaway({}); setDeviceLogs([]); setUnknownTags([]);
    setConnectedDevices(new Set([1]));
  }

  async function handleSendToDisplay() {
    if (!session?.id) return;
    setSending(true); setSendSuccess(false);
    try {
      const res = await fetch("/api/sessions/display", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // targetDisplay "" pins to the default screen (single-TV / no ?display=).
        body: JSON.stringify({ sessionId: session.id, displayId: targetDisplay || undefined }),
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

  // Take THIS session off whatever screen it's on → that screen returns to idle. Scoped by
  // sessionId so it never blanks another zone's screen (multi-display safe).
  async function handleStopDisplay() {
    if (!session?.id) return;
    try {
      await fetch("/api/sessions/display", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
      setDisplayedId(null);
      setSendSuccess(false);
    } catch { /* the display's fallback poll reconciles */ }
  }

  const visibleScans = session?.scans ?? [];

  const btnStyle = { background: "var(--color-primary)", color: "var(--color-surface)" };

  return (
    <div>
      {/* Header — wraps on tablet so the action buttons don't overflow beside the title */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>Surface Scan</h1>
          <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Surface Scan" }]} />
        </div>
        {session && (
          <div className="flex flex-wrap items-center gap-2">
            {sendSuccess && <p className="text-xs" style={{ color: "var(--color-success)" }}>✓ Sent to display</p>}
            <button onClick={() => setShowLogs(!showLogs)}
              className="px-4 py-2 rounded-xl text-sm flex items-center gap-2"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              Device Log {deviceLogs.length > 0 && `(${deviceLogs.length})`}
            </button>
            {displays.length > 0 && (
              // Which screen to send to — defaults to the one bound to this session's reader.
              <select value={targetDisplay} onChange={(e) => { userPickedDisplay.current = true; setTargetDisplay(e.target.value); }}
                aria-label="Target screen"
                className="px-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                <option value="">Default screen</option>
                {displays.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            <button onClick={handleSendToDisplay} disabled={sending || session.scans.length === 0}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
              style={{ ...btnStyle, opacity: (sending || session.scans.length === 0) ? 0.5 : 1 }}>
              {sending ? "Sending..." : "Send to Display"}
            </button>
            {displayedId === session.id && (
              <button onClick={handleStopDisplay}
                className="px-4 py-2 rounded-xl text-sm"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                Stop Display
              </button>
            )}
            <button onClick={handleEndSession}
              className="px-4 py-2 rounded-xl text-sm"
              style={{ background: "#fff0f0", color: "var(--color-danger-soft)", border: "1px solid #f5c0c0" }}>
              End Session
            </button>
          </div>
        )}
      </div>

      {!session ? (
        /* ── Start Session ── */
        <div className="max-w-md mx-auto mt-12">
          <div className="rounded-2xl p-8" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <h2 className="text-lg font-semibold mb-1 text-center" style={{ color: "var(--color-text)" }}>Start New Session</h2>
            <p className="text-sm mb-6 text-center" style={{ color: "var(--color-text-muted)" }}>ค้นหาลูกค้าหรือกรอก ID เพื่อเริ่ม session</p>
            <div className="flex rounded-xl overflow-hidden mb-4" style={{ background: "var(--color-bg)" }}>
              {(["code","name","phone"] as const).map((t) => (
                <button key={t} onClick={() => { setSearchType(t); setCustomerQuery(""); setSearchError(""); setCustomerInfo(null); setContactName(""); setContacts([]); }}
                  className="flex-1 py-2 text-xs font-medium transition-colors"
                  style={{ background: searchType === t ? "var(--color-primary)" : "transparent", color: searchType === t ? "var(--color-surface)" : "var(--color-text-muted)" }}>
                  {t === "code" ? "ID" : t === "name" ? "ชื่อ" : "เบอร์"}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-3">
              <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchCustomer()}
                placeholder={searchType === "code" ? "C0001..." : searchType === "name" ? "ค้นหาชื่อ..." : "08X-XXX-XXXX"}
                className="flex-1 px-4 py-3 rounded-xl outline-none text-sm"
                style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
              <button onClick={handleSearchCustomer} disabled={searching || !customerQuery.trim()}
                className="px-4 py-3 rounded-xl text-sm font-medium disabled:opacity-50" style={btnStyle}>
                {searching ? "..." : "ค้นหา"}
              </button>
            </div>
            {searchError && <p className="text-sm mb-3 px-1" style={{ color: "var(--color-danger)" }}>{searchError}</p>}
            {customerInfo && customerInfo.id && (
              <div className="p-4 rounded-xl mb-4 space-y-1" style={{ background: "var(--color-bg)" }}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>{customerInfo.fullName}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--color-border)", color: "var(--color-text-muted)" }}>{customerInfo.title}</span>
                </div>
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>🏢 {customerInfo.company}</p>
                <p className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>🏷️ {customerInfo.customerCode} · 📞 {customerInfo.phone}</p>
                {contacts.length > 0 && (
                  <select aria-label="Contact" value={contactName} onChange={(e) => setContactName(e.target.value)}
                    className="w-full mt-2 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                    <option value="">{customerInfo.fullName} (หลัก)</option>
                    {contacts.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                )}
              </div>
            )}
            {customerInfo && preloadName && !customerInfo.id && (
              <div className="p-4 rounded-xl mb-4 space-y-1" style={{ background: "var(--color-bg)" }}>
                <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>{customerInfo.fullName}</p>
                <p className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>🏷️ {customerInfo.customerCode}</p>
              </div>
            )}
            {error && <p className="text-sm mb-3" style={{ color: "var(--color-danger)" }}>{error}</p>}
            {loading ? (
              <div className="flex items-center justify-center py-3">
                <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
                <span className="ml-2 text-sm" style={{ color: "var(--color-text-muted)" }}>กำลังเริ่ม session...</span>
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
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex-1">
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Customer</p>
              <p className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
                {customerInfo?.fullName ? `${customerInfo.fullName} (${session.customerCode})` : session.customerCode}
              </p>
              {session.contactName && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>ผู้ติดต่อ: {session.contactName}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Total Scans</p>
              <p className="text-base font-semibold" style={{ color: "var(--color-text-muted)" }}>{session.scans.length}</p>
            </div>
          </div>

          {/* ── WebSocket Connection + Simulator ── */}
          <div className="rounded-xl overflow-hidden mb-4" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>RFID Connection</p>
              <div className="flex items-center gap-2">
                {ws.isConnected && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                <span className="text-xs" style={{ color: ws.isConnected ? "var(--color-success)" : "var(--color-text-muted)" }}>
                  {ws.isConnected ? "เชื่อมต่อแล้ว" : ws.error || "ยังไม่ได้เชื่อมต่อ"}
                </span>
              </div>
            </div>
            <div className="p-4 flex items-center gap-3 flex-wrap">
              {/* Reader occupancy — which physical readers are currently serving a customer */}
              <div className="w-full text-xs flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: "var(--color-text-muted)" }}>
                <span className="font-medium" style={{ color: "var(--color-text)" }}>Readers in use:</span>
                {Object.keys(busyReaders).length === 0 ? (
                  <span style={{ color: "var(--color-success)" }}>none — all free</span>
                ) : (
                  Object.entries(busyReaders).map(([rid, c]) => (
                    <span key={rid} className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-danger)" }} />
                      {rid} → {c.customerName} ({c.customerCode})
                    </span>
                  ))
                )}
              </div>
              {!ws.isConnected ? (
                <>
                  <select aria-label="Reader address" value="" onChange={(e) => { if (e.target.value) setDeviceIps((p) => ({ ...p, [wsDeviceId]: e.target.value })); }}
                    className="px-2 py-1.5 rounded-lg outline-none text-xs"
                    style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                    <option value="">Select reader…</option>
                    {savedReaders.length > 0 && (
                      <optgroup label="Saved readers">
                        {savedReaders.map((r) => {
                          const b = r.device ? busyReaders[r.device] : undefined;
                          const url = readerUrl(r, relayBase);
                          return <option key={r.id} value={url} disabled={!url}>{b ? `🔴 ${r.name || r.device} — in use (${b.customerName})` : (r.name || r.device || r.url)}</option>;
                        })}
                      </optgroup>
                    )}
                    {relayDevices.length > 0 && (
                      <optgroup label="Connected to relay (live)">
                        {relayDevices.map((d) => {
                          const b = busyReaders[d];
                          return <option key={"live-" + d} value={readerUrl({ device: d }, relayBase)}>{b ? `🔴 ${d} — in use (${b.customerName})` : `🟢 ${d}`}</option>;
                        })}
                      </optgroup>
                    )}
                  </select>
                  <div className="flex items-center gap-1.5 text-xs w-full sm:w-auto" style={{ color: "var(--color-text-muted)" }}>
                    <span>Reader</span>
                    <input
                      value={deviceIps[wsDeviceId]}
                      onChange={(e) => setDeviceIps((p) => ({ ...p, [wsDeviceId]: e.target.value }))}
                      placeholder="Pick a reader ↑ or type: 192.168.1.104 / wss://…"
                      className="px-2 py-1.5 rounded-lg outline-none w-full sm:w-72 max-w-full"
                      style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                  </div>
                  <button onClick={ws.connect} disabled={!deviceIps[wsDeviceId]}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ background: deviceIps[wsDeviceId] ? "#4a6fa5" : "var(--color-sidebar)" }}>
                    เชื่อมต่อ WebSocket
                  </button>
                </>
              ) : (
                <>
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Connected to</span>
                  <span className="px-2.5 py-1 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5"
                    style={{ background: "#e8f5e9", color: "#2e7d32" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    {readerIdFromUrl(deviceIps[wsDeviceId]) || "LAN (direct)"}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{deviceIps[wsDeviceId]}</span>
                  <button onClick={handleDisconnect}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "#fff0f0", color: "var(--color-danger-soft)", border: "1px solid #f5c0c0" }}>
                    ตัดการเชื่อมต่อ
                  </button>
                </>
              )}
              {/* One-click: name the current (live/picked) device and save it to the registry. */}
              {(() => {
                const tag = readerIdFromUrl(deviceIps[wsDeviceId]);
                if (!tag || savedReaders.some((r) => r.device === tag)) return null;
                return (
                  <button onClick={() => saveLiveReader(tag)} title="Save this reader to Settings so it shows by name everywhere"
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
                    💾 Save reader
                  </button>
                );
              })()}
              <div className="border-l pl-3 ml-1" style={{ borderColor: "var(--color-border)" }}>
                <button onClick={runSimulator} disabled={simulating || productMap.size === 0}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: simulating ? "var(--color-sidebar)" : "var(--color-primary)" }}>
                  {simulating ? "กำลังจำลอง..." : `จำลองการสแกน (Fix Reader burst 3000)`}
                </button>
              </div>
              <span className="text-xs ml-auto" style={{ color: "var(--color-text-subtle)" }}>
                สินค้าในระบบ: {productMap.size} รายการ
              </span>
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl text-sm"
              style={{ background: "#fff0f0", color: "var(--color-danger-soft)", border: "1px solid #f5c0c0" }}>
              {error}
            </div>
          )}

          {/* ── Device Log Panel (collapsible) ── */}
          {showLogs && (
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Device Log</p>
                <button onClick={() => setDeviceLogs([])} className="text-xs px-2 py-1 rounded-lg"
                  style={{ background: "var(--color-bg)", color: "var(--color-text-muted)" }}>ล้าง</button>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {deviceLogs.length === 0 ? (
                  <p className="text-center py-8 text-sm" style={{ color: "var(--color-text-subtle)" }}>ยังไม่มี log</p>
                ) : deviceLogs.map((log, i) => {
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5"
                      style={{ borderBottom: i < deviceLogs.length - 1 ? "1px solid var(--color-bg)" : "none" }}>
                      <span className="text-xs flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>{log.time}</span>
                      <span className="text-xs font-mono flex-shrink-0" style={{ color: "var(--color-text-subtle)" }}>{log.tag}</span>
                      <span className={`text-xs flex-1 ${log.ok ? "" : "text-red-500"}`}
                        style={{ color: log.ok ? "var(--color-text)" : "var(--color-danger)" }}>
                        {log.ok ? log.productName : "❌ ไม่พบสินค้า"}
                      </span>
                      <span className="text-xs" style={{ color: log.ok ? "var(--color-success)" : "var(--color-danger)" }}>
                        {log.ok ? "✓" : "✗"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unrecognized tags — scanned EPCs with no matching product (register them) */}
          {unknownTags.length > 0 && (
            <div className="rounded-xl p-3" style={{ background: "#fff7ed", border: "1px solid #f0c98a" }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium" style={{ color: "#b26a00" }}>
                  ⚠️ {unknownTags.length} unrecognized tag{unknownTags.length > 1 ? "s" : ""} — not registered
                </p>
                <button onClick={() => setUnknownTags([])} className="text-xs px-2 py-1 rounded-lg"
                  style={{ background: "var(--color-surface)", color: "var(--color-text-muted)", border: "1px solid #f0c98a" }}>Dismiss all</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {unknownTags.map((epc) => (
                  <div key={epc} className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{ background: "var(--color-surface)", border: "1px solid #f0c98a" }}>
                    <code className="text-xs" style={{ color: "var(--color-text-muted)" }}>{epc}</code>
                    <Link href={`/admin/products/new?rfid=${encodeURIComponent(epc)}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>Register</Link>
                    <button onClick={() => setUnknownTags((t) => t.filter((x) => x !== epc))} title="Dismiss"
                      className="text-xs" style={{ color: "var(--color-text-subtle)" }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Scan List ── */}
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            {/* Tabs */}
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                รายการสแกน <span style={{ color: "var(--color-text-muted)" }}>({session.scans.length})</span>
              </p>
              {visibleScans.some((s) => s.prepareStatus === "NONE" && s.product.returnable !== false) && (
                <button onClick={() => {
                  const ready = visibleScans.filter((s) => s.prepareStatus === "NONE" && s.product.returnable !== false && (takeaway[s.id] ?? 0) >= 1);
                  const skipped = visibleScans.filter((s) => s.prepareStatus === "NONE" && s.product.returnable !== false && (takeaway[s.id] ?? 0) < 1).length;
                  ready.forEach((s) => handlePrepare(s));
                  if (skipped > 0) warn(`${skipped} item(s) skipped — set a takeaway amount (≥ 1) first.`);
                }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: "var(--color-primary)", color: "var(--color-surface)" }}>
                  เตรียมทั้งหมด
                </button>
              )}
            </div>

            {visibleScans.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>No items scanned yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
                      {["Image","Code","Name","Location","Material","Category","Status","Takeaway","Action"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap text-xs"
                          style={{ color: "var(--color-text-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleScans.map((scan) => {
                      const sCfg = STATUS_STYLE[scan.prepareStatus];
                      return (
                        <tr key={scan.id} style={{ borderBottom: "1px solid var(--color-bg)" }}>
                          <td className="px-4 py-3">
                            {scan.product.imageUrl ? (
                              <img src={scan.product.imageUrl} alt={scan.product.name}
                                className="w-14 h-11 object-cover rounded-lg"
                                style={{ border: "1px solid var(--color-border)" }} />
                            ) : (
                              <div className="w-14 h-11 rounded-lg flex items-center justify-center"
                                style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                                <svg width="14" height="14" fill="none" stroke="#cdc3ad" strokeWidth="1.5" viewBox="0 0 24 24">
                                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                                  <circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
                                </svg>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {scan.product.productCode || "-"}
                          </td>
                          <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: "var(--color-text)" }}>
                            {scan.product.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {scan.product.location ? (
                              <span className="flex items-center gap-1 text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                                📍 {scan.product.location}
                              </span>
                            ) : <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>-</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {scan.product.materialType || "-"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--color-text-muted)" }}>
                            {scan.product.category || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {scan.prepareStatus !== "NONE" ? (
                              <span className="px-2 py-1 rounded-full text-xs font-medium"
                                style={{ background: sCfg.bg, color: sCfg.color }}>
                                {sCfg.label}
                              </span>
                            ) : <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>-</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => changeTakeaway(scan, -1)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                                style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>−</button>
                              <span className="w-7 text-center text-sm font-medium" style={{ color: "var(--color-text)" }}>
                                {takeaway[scan.id] ?? 0}
                              </span>
                              <button onClick={() => changeTakeaway(scan, 1)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                                style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>+</button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {scan.prepareStatus === "NONE" && scan.product.returnable !== false && (
                              <button onClick={() => handlePrepare(scan)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                                style={{ background: "#dbeafe", color: "#3b82f6" }}>
                                🔔 เตรียมสินค้า
                              </button>
                            )}
                            {scan.prepareStatus === "NONE" && scan.product.returnable === false && (
                              <span className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap" style={{ background: "#f0eee6", color: "var(--color-text-muted)" }}>
                                ให้ไปเลย
                              </span>
                            )}
                            {scan.prepareStatus === "PREPARING" && (
                              <button onClick={() => handleMarkComplete(scan)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap"
                                style={{ background: "#d1fae5", color: "var(--color-success)" }}>
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
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} /></div>}>
      <RFIDPageInner />
    </Suspense>
  );
}