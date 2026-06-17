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

// GET — what the TV shows. F9: the session most recently "Sent to Display" wins;
// idle/abandoned sessions are excluded (F2b) so a walked-away customer can't hijack
// the one physical screen.
export async function GET() {
  try {
    const session = await prisma.session.findFirst({
      where: { isActive: true, lastSeenAt: { gte: idleCutoff() } },
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
