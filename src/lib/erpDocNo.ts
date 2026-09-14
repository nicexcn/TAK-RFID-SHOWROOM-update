import { prisma } from "@/lib/prisma";

// ERP document numbers (TAK slide 26 + template on 27): NO{YY}{MM}{0001} per prep batch,
// assigned once when the first notification of the batch is marked COMPLETE and persisted
// on Notification.docNo, so the number never shifts.
//
// update-tak 13/9: a "batch" is ONE SESSION (= one customer visit), not one customer-day.
// The old customer-day grouping merged every walk-in session of the same day (all share
// customerId=null) into one document — a new session after "End Session" kept appending to
// the previous document. Grouping per session makes each visit its own document.
export const BKK_OFFSET_MS = 7 * 3600 * 1000;

/** Bangkok calendar day of a timestamp: "2026-08-27" */
export function bkkDayOf(d: Date): string {
  const bkk = new Date(d.getTime() + BKK_OFFSET_MS);
  return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, "0")}-${String(bkk.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Stamp a doc number on every not-yet-numbered takeaway notification of ONE session
 * (all items prepared during the same visit share the document). Idempotent: rows
 * already carrying a docNo are left alone. The sequence continues from the highest
 * existing number for the same {YY}{MM} prefix.
 *
 * update-tak 13/9 [15]: walk-in sessions (customerId null) are included — previously
 * the customerId guard skipped them, leaving walk-in prep notifications showing "—".
 */
export async function assignDocNumbers(prefix: string, window: { sessionId: string; from: Date; to: Date }) {
  // Prefer takeaway lines (scan qty > 0). update-tak 13/9: numbers are now reserved at
  // PREPARE time, when the scan may not be flushed to the DB yet (optimistic UI) — in that
  // case fall back to numbering all of the session's un-numbered notifications. A staff-
  // pressed "Prepare" always means the item is taken home, so this is the right set.
  const candidates = await prisma.notification.findMany({
    where: { sessionId: window.sessionId, createdAt: { gte: window.from, lt: window.to }, docNo: null },
    select: { id: true, productId: true },
  });
  if (candidates.length === 0) return;

  const scanKeys = await prisma.scan.findMany({
    where: { sessionId: window.sessionId, takeawayQty: { gt: 0 } },
    select: { productId: true },
  });
  const takeawayProducts = new Set(scanKeys.map((s) => s.productId));
  let ids = candidates.filter((c) => takeawayProducts.has(c.productId)).map((c) => c.id);
  if (ids.length === 0) ids = candidates.map((c) => c.id); // scan not persisted yet — number all

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
