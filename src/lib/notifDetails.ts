import { prisma } from "@/lib/prisma";

// Shared Prisma include for notifications: enough product + customer detail for the
// prep staff to identify the sample and the customer at a glance.
export const notifInclude = {
  product: {
    select: { id: true, name: true, productCode: true, location: true, imageUrl: true, brand: true, colour: true, size: true },
  },
  customer: {
    select: { id: true, customerCode: true, fullName: true, company: true, phone: true },
  },
  // Phase 2 (slide 26): server-assigned ERP document number on the batch.
  docNo: true,
} as const;

type HasSessionProduct = { sessionId: string | null; productId: string };

// A notification carries (sessionId, productId), which is Scan's unique key, so the
// customer's takeaway quantity for that sample is a clean lookup (no extra row).
export async function attachTakeaway<T extends HasSessionProduct>(notif: T): Promise<T & { takeawayQty: number | null }> {
  let takeawayQty: number | null = null;
  if (notif.sessionId) {
    const scan = await prisma.scan.findUnique({
      where: { sessionId_productId: { sessionId: notif.sessionId, productId: notif.productId } },
      select: { takeawayQty: true },
    });
    takeawayQty = scan?.takeawayQty ?? null;
  }
  return { ...notif, takeawayQty };
}

// Batch version for a list — one query for all (sessionId, productId) pairs, not N+1.
export async function attachTakeawayMany<T extends HasSessionProduct>(notifs: T[]): Promise<(T & { takeawayQty: number | null })[]> {
  const pairs = notifs.filter((n) => n.sessionId).map((n) => ({ sessionId: n.sessionId as string, productId: n.productId }));
  if (pairs.length === 0) return notifs.map((n) => ({ ...n, takeawayQty: null }));
  const scans = await prisma.scan.findMany({
    where: { OR: pairs },
    select: { sessionId: true, productId: true, takeawayQty: true },
  });
  const map = new Map(scans.map((s) => [`${s.sessionId}::${s.productId}`, s.takeawayQty]));
  return notifs.map((n) => ({
    ...n,
    takeawayQty: n.sessionId ? map.get(`${n.sessionId}::${n.productId}`) ?? null : null,
  }));
}
