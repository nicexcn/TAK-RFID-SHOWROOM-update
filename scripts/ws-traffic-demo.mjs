// Shows the actual data flowing through the relay (NO rooms — device_id is in the payload):
//   1) WS:   pusher SENDS rfid json  →  subscribers RECEIVE it (one "all", one device-filtered)
//   2) HTTP: what the relay POSTs to /api/scan + the response (server persistence path)
//   3) DB:   the Scan row that landed (attributed by payload device_id == Session.readerId)
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const RELAY = process.env.RELAY_URL || "ws://localhost:8081";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const KEY = process.env.SCAN_INGEST_KEY;
const PUSH_KEY = "pushtest";
const DEVICE = "00:11:22:33:44:55"; // the reader's device_id (in every payload)
const OTHER = "AA:AA:AA:AA:AA:AA";  // a different reader — its subscriber must NOT see DEVICE's scans
const CODE = "WS-DEMO";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date(Date.now()).toISOString().slice(11, 23);
const line = (who, arrow, data) => console.log(`${ts()}  ${who.padEnd(16)} ${arrow}  ${data}`);

async function main() {
  const products = await prisma.product.findMany({ where: { isActive: true }, take: 2, select: { rfidTag: true, name: true } });
  if (products.length < 1) throw new Error("no product");
  const [p1, p2] = products;

  // Create the session VIA THE API (login + POST /api/sessions) so the SAME server that
  // ingests also created it — exactly like production (staff start a session in the app).
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin1234" }),
  });
  if (!login.ok) throw new Error(`login failed (${login.status}) — check admin credentials`);
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const sres = await fetch(`${BASE}/api/sessions`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ customerCode: CODE, readerId: DEVICE }),
  });
  const session = await sres.json();
  if (!session?.id) throw new Error("session create failed: " + JSON.stringify(session));
  console.log(`\nbound session ${session.id.slice(0, 8)}… → readerId="${DEVICE}"  (created via API, like production)\n`);

  // ======================= LAYER 1: WS forward (no rooms) =======================
  console.log("── LAYER 1: WebSocket  pusher ▶ SEND  →  subscribers ◀ RECV  (routed by payload device_id) ──");
  const subAll = new WebSocket(`${RELAY}/`);                       // ALL readers
  const subOther = new WebSocket(`${RELAY}/?device=${OTHER}`);     // filtered to a DIFFERENT reader
  subAll.onmessage = (e) => line("SUB(all)", "◀ RECV", e.data);
  subOther.onmessage = (e) => line(`SUB(device=${OTHER.slice(0, 5)}…)`, "◀ RECV", e.data);
  await Promise.all([
    new Promise((res, rej) => { subAll.onopen = res; subAll.onerror = () => rej(new Error("subAll fail")); }),
    new Promise((res, rej) => { subOther.onopen = res; subOther.onerror = () => rej(new Error("subOther fail")); }),
  ]);
  line("SUB(all)", "⇄", `connected  ${RELAY}/`);
  line(`SUB(device=${OTHER.slice(0, 5)}…)`, "⇄", `connected  ${RELAY}/?device=${OTHER}`);

  const push = new WebSocket(`${RELAY}/?role=pusher&key=${PUSH_KEY}`); // NO room
  await new Promise((res, rej) => { push.onopen = res; push.onerror = () => rej(new Error("pusher fail")); });
  line("PUSHER", "⇄", `connected  ${RELAY}/?role=pusher`);
  await wait(150);

  // Exactly the structure MPT sends (device_id inside the payload).
  const frames = [
    { status: "START", device_id: DEVICE },
    { status: "SCANNING", device_id: DEVICE, epc: p1.rfidTag, rssi: -50.0, count: 1, battery: 100 },
    { status: "SCANNING", device_id: DEVICE, epc: (p2 || p1).rfidTag, rssi: -61.5, count: 3, battery: 100 },
    { status: "SCANNING", device_id: DEVICE, epc: p1.rfidTag, rssi: -48.0, count: 1, battery: 100 }, // dup → deduped
  ];
  for (const f of frames) {
    const json = JSON.stringify(f);
    line("PUSHER", "▶ SEND", json);
    push.send(json);
    await wait(300);
  }
  await wait(1000); // let the relay's 500ms ingest flush fire
  push.close(); subAll.close(); subOther.close();
  await wait(200);

  // ======================= LAYER 2: HTTP ingest =======================
  console.log("\n── LAYER 2: HTTP  relay → POST /api/scan  (request the relay sends + response) ──");
  const reqBody = { scans: [{ deviceId: DEVICE, rfidTag: p1.rfidTag }, { deviceId: DEVICE, rfidTag: "GHOST_TAG" }] };
  console.log(`POST ${BASE}/api/scan   header x-ingest-key: <SCAN_INGEST_KEY>`);
  console.log(`  body: ${JSON.stringify(reqBody)}`);
  const res = await fetch(`${BASE}/api/scan`, {
    method: "POST", headers: { "content-type": "application/json", "x-ingest-key": KEY }, body: JSON.stringify(reqBody),
  });
  console.log(`  ◀ ${res.status}  ${JSON.stringify(await res.json())}`);

  // ======================= LAYER 3: DB rows =======================
  console.log("\n── LAYER 3: DB  Scan rows persisted for this session ─────────────────────");
  const scans = await prisma.scan.findMany({
    where: { sessionId: session.id },
    select: { scannedAt: true, deviceId: true, product: { select: { name: true, rfidTag: true } } },
  });
  for (const s of scans) console.log(`  ${s.scannedAt.toISOString().slice(11, 19)}  epc=${s.product.rfidTag}  device=${s.deviceId}  "${s.product.name}"`);
  console.log(`  → ${scans.length} distinct scan(s) saved, attributed to device "${DEVICE}"`);

  await prisma.scan.deleteMany({ where: { sessionId: session.id } });
  await prisma.session.delete({ where: { id: session.id } });
  await prisma.customer.delete({ where: { customerCode: CODE } }).catch(() => {});
  console.log("\n(cleaned up demo session/scans)\n");
}

main().catch((e) => { console.error("DEMO ERROR:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
