import { prisma } from "@/lib/prisma";

// ERP document numbers (TAK feedback slide 26): N{YY}{MM}{0001} per prep batch
// (= one customer on one Bangkok day, takeaway lines only). Assigned once when the
// first notification in the batch is marked COMPLETE and persisted on Notification.docNo,
// so the number never shifts no matter what order notifications arrive or load in.
export const BKK_OFFSET_MS = 7 * 3600 * 1000;

/** Bangkok calendar day of a timestamp: "2026-08-27" */
export function bkkDayOf(d: Date): string {
  const bkk = new Date(d.getTime() + BKK_OFFSET_MS);
  return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, "0")}-${String(bkk.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Stamp doc numbers on every not-yet-numbered takeaway notification for one customer-day.
 * Idempotent: notifications already carrying a docNo are left alone. Sequence continues
 * from the highest existing number for the same {YY}{MM} prefix (across all customers).
 */
export async function assignDocNumbers(prefix: string, window: { customerId: string; from: Date; to: Date }) {
  // Takeaway lines only: a notification qualifies when its (sessionId, productId) scan has
  // takeawayQty > 0. Notifications for display-only scans (no takeaway) get no doc number.
  const candidates = await prisma.notification.findMany({
    where: { customerId: window.customerId, createdAt: { gte: window.from, lt: window.to }, docNo: null },
    select: { id: true, sessionId: true, productId: true },
  });
  if (candidates.length === 0) return;

  const takeaways = new Set<string>();
  const scanKeys = await prisma.scan.findMany({
    where: { sessionId: { in: candidates.map((c) => c.sessionId).filter((s): s is string => !!s) }, takeawayQty: { gt: 0 } },
    select: { sessionId: true, productId: true },
  });
  for (const s of scanKeys) takeaways.add(`${s.sessionId}|${s.productId}`);
  const ids = candidates.filter((c) => c.sessionId && takeaways.has(`${c.sessionId}|${c.productId}`)).map((c) => c.id);
  if (ids.length === 0) return;

  const last = await prisma.notification.findFirst({
    where: { docNo: { startsWith: prefix } },
    orderBy: { docNo: "desc" },
    select: { docNo: true },
  });
  let seq = last?.docNo ? parseInt(last.docNo.slice(prefix.length), 10) || 0 : 0;
  seq += 1;
  const docNo = `${prefix}${String(seq).padStart(4, "0")}`;
  await prisma.notification.updateMany({ where: { id: { in: ids } }, data: { docNo } });
  return docNo;
}
