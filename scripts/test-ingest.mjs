// End-to-end test of the server-side scan ingest (/api/scan) with a MOCK device_id.
// Proves the "confident path": relay/middleware → /api/scan → attribute via readerId →
// persist — without MPT/relay. Sets up a session bound to a mock reader directly in the
// DB, fires HTTP calls at a running dev server, verifies rows, then cleans up.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL || "http://localhost:3000";
const KEY = process.env.SCAN_INGEST_KEY;
const READER = "MOCK_READER_E2E";
const CODE = "E2E-INGEST";

const post = (body, key = KEY) =>
  fetch(`${BASE}/api/scan`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-ingest-key": key } : {}) },
    body: JSON.stringify(body),
  });

async function main() {
  if (!KEY) throw new Error("SCAN_INGEST_KEY not set in env");

  const product = await prisma.product.findFirst({ where: { isActive: true }, select: { id: true, rfidTag: true, name: true } });
  if (!product) throw new Error("no active product to test with");
  const tag = product.rfidTag;

  let customer = await prisma.customer.findUnique({ where: { customerCode: CODE } });
  if (!customer) customer = await prisma.customer.create({ data: { customerCode: CODE, fullName: "E2E Ingest Test" } });

  // Fresh active session bound to the mock reader.
  await prisma.session.updateMany({ where: { readerId: READER, isActive: true }, data: { isActive: false } });
  const session = await prisma.session.create({
    data: { customerCode: CODE, customerId: customer.id, readerId: READER, isActive: true },
  });

  const R = {};
  R.product = `${product.name} (${tag})`;

  // A. no key → 401
  R.noKey_status = (await post({ deviceId: READER, rfidTag: tag }, null)).status;
  // B. wrong key → 401
  R.wrongKey_status = (await post({ deviceId: READER, rfidTag: tag }, "WRONG")).status;
  // C. valid single → persisted:1
  const c = await post({ deviceId: READER, rfidTag: tag });
  R.validSingle = { status: c.status, body: await c.json() };
  // verify the row landed with the reader's device_id
  const scan = await prisma.scan.findFirst({ where: { sessionId: session.id, productId: product.id } });
  R.persistedInDb = !!scan;
  R.scanDeviceId = scan?.deviceId;
  // D. same again (batch form) → existing:1, persisted:0 (idempotent)
  R.idempotent = await (await post({ scans: [{ deviceId: READER, rfidTag: tag }] })).json();
  // E. unknown tag → unknownTag:1
  R.unknownTag = await (await post({ deviceId: READER, rfidTag: "NO_SUCH_TAG_XYZ" })).json();
  // F. device with no active session → noSession lists it
  R.noSession = await (await post({ deviceId: "UNBOUND_READER", rfidTag: tag })).json();

  // G. batch of a 2nd product + the first → adds 1 new, 1 existing
  const p2 = await prisma.product.findFirst({ where: { isActive: true, id: { not: product.id } }, select: { id: true, rfidTag: true } });
  if (p2) {
    R.batch = await (await post({ scans: [{ deviceId: READER, rfidTag: p2.rfidTag }, { deviceId: READER, rfidTag: tag }] })).json();
    R.sessionScanCount = await prisma.scan.count({ where: { sessionId: session.id } });
  }

  console.log(JSON.stringify(R, null, 2));

  // cleanup
  await prisma.scan.deleteMany({ where: { sessionId: session.id } });
  await prisma.session.delete({ where: { id: session.id } });
  await prisma.customer.delete({ where: { customerCode: CODE } }).catch(() => {});
}

main()
  .catch((e) => { console.error("TEST ERROR:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
