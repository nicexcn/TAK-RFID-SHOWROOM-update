import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastDisplayChanged } from "@/lib/realtime";

const PREPARE_STATES = ["NONE", "PREPARING", "COMPLETE"];

// PATCH — persist a scan's prepare status / takeaway quantity (customer req #2).
// Was previously client-only React state that vanished on reload; now durable and
// visible across staff stations + the TV.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; scanId: string }> }
) {
  try {
    const { id: sessionId, scanId } = await params;
    const { prepareStatus, takeawayQty } = await req.json();

    const data: { prepareStatus?: string; takeawayQty?: number } = {};
    if (prepareStatus !== undefined) {
      if (!PREPARE_STATES.includes(prepareStatus)) {
        return NextResponse.json({ error: "Invalid prepareStatus" }, { status: 400 });
      }
      data.prepareStatus = prepareStatus;
    }
    if (takeawayQty !== undefined) {
      const q = Number(takeawayQty);
      if (!Number.isInteger(q) || q < 0) {
        return NextResponse.json({ error: "Invalid takeawayQty" }, { status: 400 });
      }
      data.takeawayQty = q;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // Scope the update to the session in the URL so a wrong/forged scanId can't
    // touch another session's scan.
    const result = await prisma.scan.updateMany({ where: { id: scanId, sessionId }, data });
    if (result.count === 0) {
      return NextResponse.json({ error: "Scan not found in session" }, { status: 404 });
    }
    await broadcastDisplayChanged();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    console.error("SCAN PATCH ERROR:", error);
    return NextResponse.json({ error: "Failed to update scan" }, { status: 500 });
  }
}
