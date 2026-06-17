import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastDisplayChanged } from "@/lib/realtime";

// PATCH — close (end) a session. F1: "End Session" must be server-authoritative,
// otherwise an ended/abandoned session stays isActive forever and pollutes the
// TV feed + "active customers" analytics.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.session.update({ where: { id }, data: { isActive: false } });
    await broadcastDisplayChanged(); // clear/refresh the TV if this was showing
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to close session" }, { status: 500 });
  }
}
