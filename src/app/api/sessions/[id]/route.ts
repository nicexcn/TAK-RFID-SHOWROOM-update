import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastDisplayChanged } from "@/lib/realtime";

// PATCH — either:
//  - bind a reader to this session (body { readerId }) — set when staff connect a relay
//    reader after the session is already active (the reader picker only appears post-start),
//    so the reader shows "in use"; enforces one active session per reader.
//  - save the manual visit topics (body { interest | soNumber | status }) — staff type these
//    on the scan page (TAK 28/8); reports export them.
//  - close (end) the session (no body). F1: "End Session" must be server-authoritative,
//    otherwise an ended/abandoned session stays isActive forever.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({})) as { readerId?: string; clearReader?: boolean; interest?: string; soNumber?: string; status?: string };

    // Visit-topic edits (interest / SO number / status) — merge whichever strings arrived.
    const visitData: { interest?: string | null; soNumber?: string | null; status?: string | null } = {};
    for (const k of ["interest", "soNumber", "status"] as const)
      if (typeof body[k] === "string") visitData[k] = (body[k] as string).trim() || null;
    if (Object.keys(visitData).length) {
      await prisma.session.update({ where: { id }, data: visitData });
      return NextResponse.json({ ok: true });
    }

    if (typeof body.readerId === "string" && body.readerId.trim()) {
      const readerId = body.readerId.trim();
      await prisma.$transaction([
        // one active session per physical reader — release it from any other session first
        prisma.session.updateMany({ where: { isActive: true, readerId, id: { not: id } }, data: { isActive: false } }),
        prisma.session.update({ where: { id }, data: { readerId } }),
      ]);
      await broadcastDisplayChanged(); // refresh reader-occupancy on every station
      return NextResponse.json({ ok: true, readerId });
    }

    // Free the reader (staff intentionally disconnected) but KEEP the session active.
    if (body.clearReader) {
      await prisma.session.update({ where: { id }, data: { readerId: null } });
      await broadcastDisplayChanged();
      return NextResponse.json({ ok: true, readerId: null });
    }

    await prisma.session.update({ where: { id }, data: { isActive: false } });
    await broadcastDisplayChanged(); // clear/refresh the TV if this was showing
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}
