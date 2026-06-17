import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idleCutoff } from "@/lib/sessionConfig";

const sessionInclude = {
  scans: {
    include: { product: { include: { images: { orderBy: { order: "asc" as const } } } } },
    orderBy: { scannedAt: "desc" as const },
  },
};

// POST — open a session for a customer at a station.
// Concurrent sessions across stations are allowed. Opening a session:
//  - closes that STATION's previous active session (one-active-per-station), and
//  - closes any other active session for the SAME customer (F3: at most one active
//    session per customer, so two staff serving one customer converge).
// Both writes run in one transaction; a partial unique index backstops the invariant.
export async function POST(req: NextRequest) {
  try {
    const { customerCode, customerId, deviceId } = await req.json();

    const deactivateWhere: {
      isActive: true;
      OR: Array<{ deviceId: string | null } | { customerId: string }>;
    } = {
      isActive: true,
      OR: [{ deviceId: deviceId ?? null }],
    };
    if (customerId) deactivateWhere.OR.push({ customerId });

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
          customerId: customerId || null,
          deviceId: deviceId || null,
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
    const session = await prisma.session.findFirst({
      where: deviceId
        ? { isActive: true, deviceId }
        : { isActive: true, lastSeenAt: { gte: idleCutoff() } },
      orderBy: { createdAt: "desc" },
      include: sessionInclude,
    });
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}
