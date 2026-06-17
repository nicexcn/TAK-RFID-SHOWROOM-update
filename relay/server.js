/**
 * TAK RFID — plain WebSocket relay (Option E).
 *
 * Vercel can't host a long-lived WS server, so this tiny standalone Node + `ws`
 * relay runs on any always-on host (Railway / Render / Fly.io / VPS) and bridges:
 *
 *   reader middleware (WS client, role=pusher) ──► [relay, rooms keyed by deviceId] ──► browsers (role=subscriber)
 *
 * Connect URL:  wss://<relay-host>/?room=<deviceId>&role=<pusher|subscriber>&key=<INGEST_KEY for pushers>
 *
 * - A PUSHER (the middleware) must present the correct key; every message it sends
 *   is forwarded verbatim to all SUBSCRIBERS in the same room.
 * - A SUBSCRIBER (a browser /display or /admin/rfid) just receives — same RFID JSON
 *   shape the LAN middleware already emits, so the existing browser WS client works
 *   unchanged. Subscribers are open (parity with the public TV display); pushers are keyed.
 */
const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8081;
const INGEST_KEY = process.env.INGEST_KEY || ""; // required for pushers; "" disables the gate (dev only)
const HEARTBEAT_MS = 30000;

/** room id -> Set<ws subscribers> */
const rooms = new Map();

function subscribersOf(room) {
  let set = rooms.get(room);
  if (!set) { set = new Set(); rooms.set(room, set); }
  return set;
}

const server = http.createServer((req, res) => {
  // Health check for the hosting platform.
  if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/health"))) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  let url;
  try { url = new URL(req.url, "http://relay"); } catch { ws.close(1008, "bad url"); return; }
  const room = (url.searchParams.get("room") || "default").trim();
  const role = url.searchParams.get("role") === "pusher" ? "pusher" : "subscriber";
  const key = url.searchParams.get("key") || "";

  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  if (role === "pusher") {
    if (INGEST_KEY && key !== INGEST_KEY) {
      ws.close(1008, "unauthorized");
      return;
    }
    console.log(`pusher connected → room "${room}"`);
    ws.on("message", (data) => {
      const msg = data.toString();
      for (const sub of subscribersOf(room)) {
        if (sub.readyState === 1) sub.send(msg);
      }
    });
    ws.on("close", () => console.log(`pusher left → room "${room}"`));
  } else {
    const set = subscribersOf(room);
    set.add(ws);
    console.log(`subscriber joined → room "${room}" (${set.size})`);
    ws.send(JSON.stringify({ type: "SYSTEM", message: "relay:joined", room }));
    ws.on("close", () => {
      set.delete(ws);
      if (set.size === 0) rooms.delete(room);
    });
  }
});

// Drop dead connections so rooms don't leak.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* closing */ }
  }
}, HEARTBEAT_MS);
wss.on("close", () => clearInterval(heartbeat));

server.listen(PORT, () => console.log(`TAK RFID relay listening on :${PORT} (auth ${INGEST_KEY ? "ON" : "OFF — dev"})`));
