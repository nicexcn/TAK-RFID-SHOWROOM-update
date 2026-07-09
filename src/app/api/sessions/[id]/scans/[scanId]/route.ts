import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastDisplayChanged, broadcastNotifications } from "@/lib/realtime";

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
    const { prepareStatus, takeawayQty, productId } = await req.json();

    const data: { prepareStatus?: string; takeawayQty?: number; isLoan?: boolean } = {};
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

    // Resolve the target product. Prefer the body's productId — a just-scanned item has an
    // optimistic CLIENT id (e.g. "ws-...") that isn't a real DB id yet, so keying by scanId
    // would 404 and the UI change would revert. (sessionId, productId) is Scan's unique key.
    let pid: string | undefined = typeof productId === "string" && productId ? productId : undefined;
    if (!pid) {
      const found = await prisma.scan.findFirst({ where: { id: scanId, sessionId }, select: { productId: true } });
      pid = found?.productId;
    }
    if (!pid) {
      return NextResponse.json({ error: "Scan not found in session" }, { status: 404 });
    }

    // Per-session takeaway limit (server backstop; also covers concurrent stations).
    if (data.takeawayQty !== undefined) {
      const settings = await prisma.appSettings.findUnique({
        where: { id: "singleton" },
        select: { takeawayLimit: true, takeawayEnabled: true },
      });
      if (settings?.takeawayEnabled) {
        const others = await prisma.scan.aggregate({
          where: { sessionId, productId: { not: pid } },
          _sum: { takeawayQty: true },
        });
        const total = (others._sum.takeawayQty ?? 0) + data.takeawayQty;
        if (total > (settings.takeawayLimit ?? 3)) {
          return NextResponse.json(
            { error: `Takeaway limit exceeded (max ${settings.takeawayLimit})`, limit: settings.takeawayLimit },
            { status: 400 },
          );
        }
      }
    }

    // image3: snapshot loan-ness from the product's returnable, but ONLY on the INITIAL takeaway
    // (new scan, or prior qty was 0). Later qty edits preserve the original snapshot, so a mid-loan
    // product flip to give-away can't downgrade / orphan an outstanding loan (see /api/loans).
    if (data.takeawayQty !== undefined) {
      const existing = await prisma.scan.findUnique({
        where: { sessionId_productId: { sessionId, productId: pid } },
        select: { takeawayQty: true },
      });
      if (!existing || existing.takeawayQty === 0) {
        const prodR = await prisma.product.findUnique({ where: { id: pid }, select: { returnable: true } });
        data.isLoan = prodR?.returnable !== false;
      }
    }

    // Upsert by the stable key so an optimistic/not-yet-flushed scan still works. Require a
    // real session (the FK guards against a forged sessionId; isActive keeps closed sessions clean).
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { isActive: true } });
    if (!session || !session.isActive) {
      return NextResponse.json({ error: "Session not found or inactive" }, { status: 404 });
    }
    await prisma.scan.upsert({
      where: { sessionId_productId: { sessionId, productId: pid } },
      update: data,
      create: { sessionId, productId: pid, ...data },
    });
    await broadcastDisplayChanged();

    // Floor staff marking a sample done closes its prepare notification too.
    if (data.prepareStatus === "COMPLETE") {
      await prisma.notification.updateMany({
        where: { sessionId, productId: pid },
        data: { status: "COMPLETE" },
      });
      await broadcastNotifications();
    }
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    console.error("SCAN PATCH ERROR:", error);
    return NextResponse.json({ error: "Failed to update scan" }, { status: 500 });
  }
}

// DELETE — remove a scan from a session (e.g. an item added by mistake on the manual
// picker). Keyed by (sessionId, productId) like PATCH so an optimistic/unflushed id still
// resolves; falls back to the URL's scanId. Idempotent (deleteMany never throws on absence).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; scanId: string }> }
) {
  try {
    const { id: sessionId, scanId } = await params;
    const body = await req.json().catch(() => ({} as { productId?: string }));
    let pid: string | undefined = typeof body.productId === "string" && body.productId ? body.productId : undefined;
    if (!pid) {
      const found = await prisma.scan.findFirst({ where: { id: scanId, sessionId }, select: { productId: true } });
      pid = found?.productId;
    }
    if (!pid) {
      return NextResponse.json({ error: "Scan not found in session" }, { status: 404 });
    }
    await prisma.scan.deleteMany({ where: { sessionId, productId: pid } });
    // Drop any pending prepare notification for the removed item — mark read too so it
    // clears the unread bell badge (the count query filters on isRead, not status).
    await prisma.notification.updateMany({ where: { sessionId, productId: pid }, data: { status: "COMPLETE", isRead: true } });
    await broadcastDisplayChanged();
    await broadcastNotifications();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("SCAN DELETE ERROR:", error);
    return NextResponse.json({ error: "Failed to delete scan" }, { status: 500 });
  }
}
