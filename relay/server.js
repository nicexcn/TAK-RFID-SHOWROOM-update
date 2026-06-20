/**
 * TAK RFID — plain WebSocket relay (Option E).
 *
 * Vercel can't host a long-lived WS server, so this tiny standalone Node + `ws`
 * relay runs on any always-on host (Railway / Render / Fly.io / VPS) and bridges:
 *
 *   reader middleware (WS client, role=pusher) ──► [relay] ──► browsers (subscribers)
 *
 * The reader's identity is IN every message (MPT confirmed — `device_id`, plus the
 * mac_address/serial_number aliases), so the relay does NOT need rooms in the URL. It
 * reads `device_id` straight from the payload to (a) route to any device-filtered
 * subscribers and (b) attribute server-side persistence.
 *
 *   payload: {"status":"SCANNING","device_id":"00:11:22:33:44:55","epc":"E280…","rssi":-50.0,"count":1,"battery":100}
 *
 * Connect URLs:
 *   pusher     wss://<relay-host>/?role=pusher&key=<INGEST_KEY>
 *   pusher     wss://<relay-host>/?role=pusher&key=<KEY>&device=<id>  → TAG this reader's stream
 *   subscriber wss://<relay-host>/                      → receives ALL readers
 *   subscriber wss://<relay-host>/?device=<device_id>   → receives only that reader
 *
 * - A PUSHER (the middleware) must present the correct key; every message it sends is
 *   forwarded to matching SUBSCRIBERS. Subscribers are open (parity with the public TV
 *   display); pushers are keyed.
 * - SEPARATING READERS: a pusher may add ?device=<id> to tag its WHOLE stream — the relay
 *   stamps that id onto every message (overriding the payload's device_id), so the BLE
 *   handheld and the table reader stay distinct even when the middleware can only send a
 *   generic/"UNKNOWN" device_id in the body. Without it, the payload device_id is used.
 * - SERVER-SIDE PERSISTENCE (the "confident path"): when APP_BASE_URL + SCAN_INGEST_KEY
 *   are set, the relay also ingests each scan into the app's /api/scan (dedup + batched),
 *   so the SERVER persists it — attributed via the payload's device_id → the active
 *   Session bound to that readerId. Unset = pure forwarder (backward compatible).
 */
const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8081;
const INGEST_KEY = process.env.INGEST_KEY || ""; // required for pushers; "" disables the gate (dev only)
const HEARTBEAT_MS = 30000;

// ── Server-side persistence (optional) ──────────────────────────────────────
const APP_BASE_URL = (process.env.APP_BASE_URL || "").replace(/\/+$/, ""); // e.g. https://app.vercel.app
const SCAN_INGEST_KEY = process.env.SCAN_INGEST_KEY || "";                  // must equal the app's SCAN_INGEST_KEY
const INGEST_ENABLED = !!APP_BASE_URL && !!SCAN_INGEST_KEY;
const FLUSH_MS = 500;        // batch window (collapses the reader's repeat-scan burst)
const MAX_BATCH = 500;       // /api/scan accepts up to 500 per POST
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // periodically forget seen tags so re-scans backfill (idempotent)

/** all connected browsers; each ws may carry an optional `.deviceFilter` */
const subscribers = new Set();
/** device_id -> { seen:Set<epc>, queue:string[], timer } — ingest dedup/batch state */
const ingestByDevice = new Map();
/** device_id -> last-seen ms — readers currently/recently pushing (for the admin reader picker) */
const seenDevices = new Map();
const DEVICE_TTL_MS = 60 * 1000; // a device counts as "connected" if seen within this window
function markDevice(id) { if (id) seenDevices.set(id, Date.now()); }

// The reader identity is in every message (mirror of src/lib/rfidMessage.ts readDeviceId).
function readDeviceId(data) {
  const v =
    data.device_id ?? data.deviceId ?? data.mac_address ?? data.macAddress ??
    data.mac ?? data.serial_number ?? data.serialNumber ?? data.serial;
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

// Parse a forwarded reader message into { deviceId, epc }. Session frames (START/STOP/
// CLEAR) and battery frames yield epc="" (nothing to persist) but keep their deviceId
// so they still route to the right device-filtered subscribers.
function parseScan(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const t = String(raw).trim();
    return { deviceId: "", epc: t.length > 5 ? t : "" }; // plain-text EPC fallback
  }
  if (!data || typeof data !== "object") return { deviceId: "", epc: "" };
  const deviceId = readDeviceId(data);
  if (data.status === "START" || data.status === "STOP" || data.status === "CLEAR") return { deviceId, epc: "" };
  return { deviceId, epc: data.epc != null ? String(data.epc).trim() : "" };
}

// Overwrite a message's device_id with the pusher's connection-level tag (?device=), so a
// middleware that can't put a real per-device id in the body (e.g. it sends "UNKNOWN") can
// still be told apart per reader. Returns the rewritten JSON, or the raw string if not JSON.
function stampDeviceId(raw, deviceId) {
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object") {
      data.device_id = deviceId;
      return JSON.stringify(data);
    }
  } catch { /* non-JSON (plain EPC) — leave as-is; routing still uses the tag */ }
  return raw;
}

function ingestState(deviceId) {
  let st = ingestByDevice.get(deviceId);
  if (!st) { st = { seen: new Set(), queue: [], timer: null }; ingestByDevice.set(deviceId, st); }
  return st;
}

function queueIngest(deviceId, epc) {
  const st = ingestState(deviceId);
  if (st.seen.has(epc)) return; // collapse repeat scans (idempotent on the server anyway)
  st.seen.add(epc);
  st.queue.push(epc);
  if (!st.timer) st.timer = setTimeout(() => flushIngest(deviceId), FLUSH_MS);
}

async function flushIngest(deviceId) {
  const st = ingestByDevice.get(deviceId);
  if (!st) return;
  st.timer = null;
  const batch = st.queue.splice(0, MAX_BATCH);
  if (batch.length === 0) return;
  const body = JSON.stringify({ scans: batch.map((epc) => ({ deviceId, rfidTag: epc })) });
  try {
    const res = await fetch(`${APP_BASE_URL}/api/scan`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingest-key": SCAN_INGEST_KEY },
      body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(`ingest flush failed (device "${deviceId}"): ${err.message}`);
    for (const epc of batch) st.seen.delete(epc);
    st.queue.unshift(...batch);
    if (!st.timer) st.timer = setTimeout(() => flushIngest(deviceId), 2000);
    return;
  }
  if (st.queue.length > 0 && !st.timer) st.timer = setTimeout(() => flushIngest(deviceId), FLUSH_MS);
}

const server = http.createServer((req, res) => {
  const cors = { "access-control-allow-origin": "*" }; // device list is non-sensitive; browser fetch from the app
  // Live list of readers currently pushing — the /admin/rfid reader picker reads this.
  if (req.method === "GET" && req.url.startsWith("/devices")) {
    const now = Date.now();
    const devices = [...seenDevices.entries()]
      .filter(([, t]) => now - t < DEVICE_TTL_MS)
      .sort((a, b) => b[1] - a[1])
      .map(([id, t]) => ({ id, idleMs: now - t }));
    res.writeHead(200, { "content-type": "application/json", ...cors });
    res.end(JSON.stringify({ devices }));
    return;
  }
  if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/health"))) {
    res.writeHead(200, { "content-type": "application/json", ...cors });
    res.end(JSON.stringify({ ok: true, subscribers: subscribers.size, ingest: INGEST_ENABLED }));
    return;
  }
  res.writeHead(404, cors);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  let url;
  try { url = new URL(req.url, "http://relay"); } catch { ws.close(1008, "bad url"); return; }
  const role = url.searchParams.get("role") === "pusher" ? "pusher" : "subscriber";
  const key = url.searchParams.get("key") || "";

  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  if (role === "pusher") {
    if (INGEST_KEY && key !== INGEST_KEY) { ws.close(1008, "unauthorized"); return; }
    // Optional connection-level identity: ?device=<id> tags THIS pusher's whole stream,
    // overriding the payload's device_id. Lets the BLE handheld and the table reader be
    // told apart even when the middleware can't send a real per-device id in the body.
    const pusherDevice = (url.searchParams.get("device") || "").trim();
    if (pusherDevice) markDevice(pusherDevice); // show up in /devices even before the first scan
    console.log(`pusher connected${pusherDevice ? ` device=${pusherDevice}` : ""}${INGEST_ENABLED ? " (persist on)" : ""}`);
    ws.on("message", (data) => {
      let msg = data.toString();
      let { deviceId, epc } = parseScan(msg);
      if (pusherDevice) {
        deviceId = pusherDevice;                 // the connection tag wins over the payload
        msg = stampDeviceId(msg, pusherDevice);  // so subscribers + ingest see the right id
      }
      markDevice(deviceId); // track this reader for the admin reader picker (/devices)
      for (const sub of subscribers) {
        if (sub.readyState !== 1) continue;
        if (sub.deviceFilter && sub.deviceFilter !== deviceId) continue; // device filter (optional)
        sub.send(msg);
      }
      if (INGEST_ENABLED && deviceId && epc) queueIngest(deviceId, epc); // ← persist server-side
    });
    ws.on("close", () => console.log(`pusher left${pusherDevice ? ` (device=${pusherDevice})` : ""}`));
  } else {
    // Optional device filter: ?device=<id> → only that reader's scans (default = all).
    ws.deviceFilter = (url.searchParams.get("device") || "").trim();
    subscribers.add(ws);
    console.log(`subscriber joined${ws.deviceFilter ? ` (device=${ws.deviceFilter})` : " (all)"} (${subscribers.size})`);
    ws.send(JSON.stringify({ type: "SYSTEM", message: "relay:joined", device: ws.deviceFilter || null }));
    ws.on("close", () => subscribers.delete(ws));
  }
});

// Drop dead connections.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* closing */ }
  }
}, HEARTBEAT_MS);
wss.on("close", () => clearInterval(heartbeat));

// Periodically forget seen tags so a tag re-scanned later (e.g. after a session starts)
// can be re-ingested. /api/scan is idempotent, so re-sends are harmless.
const dedupReset = setInterval(() => {
  for (const st of ingestByDevice.values()) st.seen.clear();
}, DEDUP_WINDOW_MS);
wss.on("close", () => clearInterval(dedupReset));

server.listen(PORT, () =>
  console.log(
    `TAK RFID relay listening on :${PORT} (auth ${INGEST_KEY ? "ON" : "OFF — dev"}, ` +
    `persist ${INGEST_ENABLED ? "ON → " + APP_BASE_URL : "OFF"})`
  )
);
