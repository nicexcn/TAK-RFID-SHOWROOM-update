// One-time backfill (update-tak 13/9): re-assign docNo per SESSION (one visit = one
// document). Fixes rows stamped under the old (customer, day) grouping where every walk-in
// session of the same day shared one docNo. Clears docNo on takeaway COMPLETE/PREPARE
// notifications that have a sessionId, then re-stamps per session in chronological order,
// continuing each month's sequence. Preserves month ordering of existing numbers.
// Idempotent-ish: re-running re-stamps the same set. Run: npx tsx scripts/backfill-docno-per-session.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const BKK = 7 * 3600 * 1000;

async function main() {
  // All numbered takeaway notifications WITH a session — the set that may be mis-grouped.
  const rows = await prisma.notification.findMany({
    where: { docNo: { not: null }, sessionId: { not: null } },
    select: { id: true, sessionId: true, productId: true, createdAt: true, docNo: true },
    orderBy: { createdAt: "asc" },
  });
  // Keep only takeaway rows (scan has takeawayQty > 0) — same rule as assignment.
  const withQty = new Set(
    (await prisma.scan.findMany({ where: { takeawayQty: { gt: 0 } }, select: { sessionId: true, productId: true } }))
      .map((s) => `${s.sessionId}|${s.productId}`),
  );
  const takeaway = rows.filter((r) => r.sessionId && withQty.has(`${r.sessionId}|${r.productId}`));
  console.log(`${takeaway.length} numbered takeaway notifications (with session) to re-check.`);

  // Group by session; find sessions sharing a docNo with another session.
  const bySession = new Map<string, typeof takeaway>();
  for (const r of takeaway) {
    const arr = bySession.get(r.sessionId!) || [];
    arr.push(r);
    bySession.set(r.sessionId!, arr);
  }
  const docSessions = new Map<string, string[]>();
  for (const [sid, items] of bySession) {
    const doc = items[0].docNo!;
    docSessions.set(doc, [...(docSessions.get(doc) || []), sid]);
  }
  const shared = [...docSessions.entries()].filter(([, sids]) => sids.length > 1);
  const conflictedSessions = shared.flatMap(([, sids]) => sids.slice(1)); // keep first session's number
  if (conflictedSessions.length === 0) {
    console.log("No cross-session docNo sharing found — nothing to fix.");
    return;
  }
  console.log(`${shared.length} docNos shared across sessions; re-stamping ${conflictedSessions.length} later session(s).`);

  // Re-stamp: for each conflicted session (chronological), clear then assign the next
  // number for that month prefix.
  for (const sid of conflictedSessions) {
    const items = bySession.get(sid)!;
    const first = items[0];
    const bkk = new Date(first.createdAt.getTime() + BKK);
    const prefix = `NO${String(bkk.getUTCFullYear()).slice(2)}${String(bkk.getUTCMonth() + 1).padStart(2, "0")}`;
    await prisma.notification.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { docNo: null } });
    const last = await prisma.notification.findFirst({ where: { docNo: { startsWith: prefix } }, orderBy: { docNo: "desc" }, select: { docNo: true } });
    const seq = (last?.docNo ? parseInt(last.docNo.slice(prefix.length), 10) || 0 : 0) + 1;
    const docNo = `${prefix}${String(seq).padStart(4, "0")}`;
    await prisma.notification.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { docNo } });
    console.log(`  session ${sid.slice(-6)}… → ${docNo} (${items.length} items)`);
  }
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
