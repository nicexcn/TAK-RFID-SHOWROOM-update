// Verifies the RELAY's server-side persistence path (NO rooms — device_id is in the
// payload): a pusher sends RFID messages; the relay reads device_id from each, dedups/
// batches, and POSTs to /api/scan, which attributes via readerId == device_id.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const RELAY = process.env.RELAY_URL || "ws://localhost:8081";
const PUSH_KEY = process.env.RELAY_PUSH_KEY || "pushtest";
const DEVICE = "00:11:22:33:44:55";
const CODE = "E2E-RELAY";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const products = await prisma.product.findMany({ where: { isActive: true }, take: 3, select: { id: true, rfidTag: true } });
  if (products.length < 2) throw new Error("need >=2 active products");
  const tags = products.map((p) => p.rfidTag);

  let customer = await prisma.customer.findUnique({ where: { customerCode: CODE } });
  if (!customer) customer = await prisma.customer.create({ data: { customerCode: CODE, fullName: "E2E Relay Test" } });
  await prisma.session.updateMany({ where: { readerId: DEVICE, isActive: true }, data: { isActive: false } });
  const session = await prisma.session.create({
    data: { customerCode: CODE, customerId: customer.id, readerId: DEVICE, isActive: true },
  });

  const ws = new WebSocket(`${RELAY}/?role=pusher&key=${PUSH_KEY}`); // no room
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws connect failed")); });

  const send = (o) => ws.send(JSON.stringify(o));
  send({ status: "START", device_id: DEVICE });
  for (let i = 0; i < 200; i++) {
    send({ status: "SCANNING", device_id: DEVICE, epc: tags[i % tags.length], rssi: -55.0, count: 1, battery: 100 });
  }
  send({ status: "SCANNING", device_id: DEVICE, epc: "GHOST_TAG_NOPE", rssi: -80.0, count: 1 }); // unknown
  send({ status: "SCANNING", epc: tags[0], rssi: -70.0, count: 1 });                              // NO device_id → not ingested

  await wait(1500);
  ws.close();

  const scans = await prisma.scan.findMany({ where: { sessionId: session.id }, select: { productId: true, deviceId: true } });
  const persisted = new Set(scans.map((s) => s.productId));
  const expected = new Set(products.map((p) => p.id));

  console.log(JSON.stringify({
    sentDistinctTags: tags.length,
    persistedDistinct: scans.length,
    allExpectedPersisted: [...expected].every((id) => persisted.has(id)),
    deviceIdsOnScans: [...new Set(scans.map((s) => s.deviceId))],
  }, null, 2));

  await prisma.scan.deleteMany({ where: { sessionId: session.id } });
  await prisma.session.delete({ where: { id: session.id } });
  await prisma.customer.delete({ where: { customerCode: CODE } }).catch(() => {});
}

main().catch((e) => { console.error("RELAY TEST ERROR:", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
