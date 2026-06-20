import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idleCutoff } from "@/lib/sessionConfig";
import { broadcastDisplayChanged } from "@/lib/realtime";

// POST — explicitly push a session to the TV. F9: stamp displayedAt so the GET
// can deterministically prefer the most-recently "Sent to Display" session.
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();
    await prisma.session.update({
      where: { id: sessionId },
      data: { isActive: true, displayedAt: new Date() },
    });
    await broadcastDisplayChanged();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to send to display" }, { status: 500 });
  }
}

// GET — what the TV shows. Only sessions EXPLICITLY "Sent to Display" appear here
// (displayedAt != null): a handheld scanning into a customer's session must NOT auto-show
// — staff curate first, then press "ส่งขึ้นจอ". The most recently sent wins; idle/abandoned
// sessions are excluded (F2b) so a walked-away customer can't hijack the one physical screen.
// (The ambient table reader shows live over the WebSocket, not through this endpoint.)
export async function GET() {
  try {
    const cutoff = await idleCutoff();
    const session = await prisma.session.findFirst({
      where: { isActive: true, displayedAt: { not: null }, lastSeenAt: { gte: cutoff } },
      orderBy: [{ displayedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      include: {
        scans: {
          include: { product: { include: { images: { orderBy: { order: "asc" } } } } },
          orderBy: { scannedAt: "asc" },
        },
      },
    });
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json({ error: "Failed to load display" }, { status: 500 });
  }
}

// DELETE — take a session off the TV (clear displayedAt). Since GET only returns sessions
// with displayedAt set, the screen falls back to idle / the ambient table view. With a
// sessionId clears just that one; without, clears whatever is currently shown.
export async function DELETE(req: NextRequest) {
  try {
    const { sessionId } = await req.json().catch(() => ({}));
    await prisma.session.updateMany({
      where: sessionId ? { id: sessionId } : { displayedAt: { not: null } },
      data: { displayedAt: null },
    });
    await broadcastDisplayChanged();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to stop display" }, { status: 500 });
  }
}
