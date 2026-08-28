import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idleCutoff } from "@/lib/sessionConfig";

const sessionInclude = {
  scans: {
    include: { product: { include: { images: { orderBy: { order: "asc" as const } } } } },
    orderBy: { scannedAt: "desc" as const },
  },
  // TAK 28/8: resolve the visit's project so the scan page can show its name
  // (also correct after a reload/resume). A deleted project → null (SetNull).
  project: { select: { id: true, name: true } },
};

// POST — open a session for a customer at a station.
// Concurrent sessions across stations are allowed. Opening a session:
//  - closes that STATION's previous active session (one-active-per-station), and
//  - closes any other active session for the SAME customer (F3: at most one active
//    session per customer, so two staff serving one customer converge).
// Both writes run in one transaction; a partial unique index backstops the invariant.
export async function POST(req: NextRequest) {
  try {
    const { customerCode, customerId, deviceId, readerId, contactName, contactId, projectId, interest, soNumber, status } = await req.json();

    // Resolve the customerId from the code when the client didn't supply one (e.g. staff
    // typed the customer ID directly instead of picking a search result). Otherwise the
    // session — and every notification raised from it — would link no customer.
    let resolvedCustomerId: string | null = customerId || null;
    if (!resolvedCustomerId && customerCode) {
      const cust = await prisma.customer.findUnique({ where: { customerCode }, select: { id: true } });
      resolvedCustomerId = cust?.id ?? null;
    }

    const deactivateWhere: {
      isActive: true;
      OR: Array<{ deviceId: string | null } | { customerId: string } | { readerId: string }>;
    } = {
      isActive: true,
      OR: [{ deviceId: deviceId ?? null }],
    };
    if (resolvedCustomerId) deactivateWhere.OR.push({ customerId: resolvedCustomerId });
    // One active session per physical reader: binding a reader to a new customer closes
    // whatever it was last bound to, so server-side ingest (/api/scan) can't misattribute.
    if (readerId) deactivateWhere.OR.push({ readerId: String(readerId) });

    // count what we're replacing so the client can confirm a customer switch
    const replaced = await prisma.session.findMany({
      where: deactivateWhere,
      select: { id: true, customerCode: true },
    });

    const [, session] = await prisma.$transaction([
      prisma.session.updateMany({ where: deactivateWhere, data: { isActive: false } }),
      prisma.session.create({
        data: {
          customerCode,
          customerId: resolvedCustomerId,
          contactName: String(contactName || "").trim() || null,
          // Phase 2 structured links (slides 9+11): a saved contact + the project this
          // visit belongs to. Kept alongside contactName so old clients keep working.
          contactId: String(contactId || "").trim() || null,
          projectId: String(projectId || "").trim() || null,
          // Manual visit topics (TAK 28/8): staff fill these on the scan page; reports export them.
          interest: String(interest || "").trim() || null,
          soNumber: String(soNumber || "").trim() || null,
          status: String(status || "").trim() || null,
          deviceId: deviceId || null,
          readerId: readerId ? String(readerId) : null,
          isActive: true,
        },
      }),
    ]);

    return NextResponse.json({
      ...session,
      replacedActiveSession: replaced.length > 0,
      previousCustomers: replaced.map((r) => r.customerCode).filter((c) => c !== customerCode),
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

// GET — the active session for a station (?deviceId=...), or the latest non-idle
// active session when no station is specified. Idle (abandoned) sessions are skipped.
export async function GET(req: NextRequest) {
  try {
    const deviceId = new URL(req.url).searchParams.get("deviceId");
    const cutoff = await idleCutoff();
    const session = await prisma.session.findFirst({
      where: deviceId
        ? { isActive: true, deviceId }
        : { isActive: true, lastSeenAt: { gte: cutoff } },
      orderBy: { createdAt: "desc" },
      include: sessionInclude,
    });
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}
