import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idleCutoff } from "@/lib/sessionConfig";

// Which physical readers are currently IN USE — i.e. bound to a live (non-idle) customer
// session via Session.readerId. Lets the scan page show "reader-table → busy (สมชาย)" so
// staff don't grab a reader another customer is already on. (Session has no customer
// relation, so names are resolved by customerId in a second batched query.)
export async function GET() {
  try {
    const cutoff = await idleCutoff();
    const sessions = await prisma.session.findMany({
      where: { isActive: true, readerId: { not: null }, lastSeenAt: { gte: cutoff } },
      select: { readerId: true, customerCode: true, customerId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const ids = [...new Set(sessions.map((s) => s.customerId).filter(Boolean) as string[])];
    const customers = ids.length
      ? await prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
      : [];
    const nameById = new Map(customers.map((c) => [c.id, c.fullName]));

    const readers = sessions.map((s) => ({
      readerId: s.readerId as string,
      customerCode: s.customerCode,
      customerName: (s.customerId && nameById.get(s.customerId)) || s.customerCode,
      since: s.createdAt,
    }));
    return NextResponse.json({ readers });
  } catch (error) {
    console.error("READERS GET ERROR:", error);
    return NextResponse.json({ readers: [] });
  }
}
