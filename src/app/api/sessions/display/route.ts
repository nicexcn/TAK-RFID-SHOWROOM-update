import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idleCutoff } from "@/lib/sessionConfig";
import { broadcastDisplayChanged } from "@/lib/realtime";

// POST — push a session to a specific TV screen. `displayId` selects which physical screen
// (zone, a SavedDisplay.id); omitted/empty pins to the default/unassigned screen
// (displayId = null), so single-TV deployments keep working unchanged. F9: stamp displayedAt
// so the GET can deterministically prefer the most-recently sent session per screen.
export async function POST(req: NextRequest) {
  try {
    const { sessionId, displayId } = await req.json();
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    await prisma.session.update({
      where: { id: sessionId },
      data: { isActive: true, displayedAt: new Date(), displayId: displayId ? String(displayId) : null },
    });
    await broadcastDisplayChanged();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to send to display" }, { status: 500 });
  }
}

// GET — two modes, both scoped to EXPLICITLY sent (displayedAt != null), still-live (not
// idle) sessions; the most recently sent wins.
//   ?display=<id>  → the session currently shown on THAT screen (for the TV). Absent → the
//                    default screen (displayId = null), preserving the original single-TV path.
//                    Includes scans+products (what the screen renders).
//   ?session=<id>  → is THIS session currently live on a screen anywhere (for the staff scan
//                    page's "Stop Display" state)? Returns a slim row {id, displayId} or null.
// A handheld scanning into a customer's session must NOT auto-show — staff curate, then press
// "ส่งขึ้นจอ". Idle/abandoned sessions are excluded so a walked-away customer can't hijack a screen.
export async function GET(req: NextRequest) {
  try {
    const cutoff = await idleCutoff();
    const base = { isActive: true, displayedAt: { not: null }, lastSeenAt: { gte: cutoff } };
    const { searchParams } = new URL(req.url);

    const sessionId = searchParams.get("session");
    if (sessionId) {
      const session = await prisma.session.findFirst({
        where: { ...base, id: sessionId },
        select: { id: true, displayId: true, displayedAt: true },
      });
      return NextResponse.json(session);
    }

    const displayParam = (searchParams.get("display") || "").trim();
    const session = await prisma.session.findFirst({
      where: { ...base, displayId: displayParam || null },
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

// DELETE — take a screen back to idle (clear displayedAt). `displayId` SCOPES the clear to
// one screen, so stopping Table A never blanks Table B; omitted → the default screen. With a
// `sessionId`, clears just that session (whichever screen it's on). GET then falls back to
// idle / the ambient table view for that screen.
export async function DELETE(req: NextRequest) {
  try {
    const { sessionId, displayId } = await req.json().catch(() => ({}));
    const where = sessionId
      ? { id: String(sessionId) }
      : { displayedAt: { not: null }, displayId: displayId ? String(displayId) : null };
    await prisma.session.updateMany({ where, data: { displayedAt: null } });
    await broadcastDisplayChanged();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to stop display" }, { status: 500 });
  }
}
