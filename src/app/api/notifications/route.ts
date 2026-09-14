import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastNotifications } from "@/lib/realtime";
import { notifInclude, attachTakeaway, attachTakeawayMany, attachVisitInfoMany } from "@/lib/notifDetails";
import { assignDocNumbers } from "@/lib/erpDocNo";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const notifications = await prisma.notification.findMany({
      where: unreadOnly ? { isRead: false } : {},
      include: notifInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json(await attachVisitInfoMany(await attachTakeawayMany(notifications)));
  } catch (error) {
    console.error("NOTIF GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}

// POST — raise a "prepare this sample" alert. Deduped per (session, product): re-pressing
// "เตรียม" re-surfaces the existing alert instead of spamming a new row.
export async function POST(req: NextRequest) {
  try {
    const { productId, customerId, sessionId, title, message } = await req.json();
    if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

    // image3: give-away products (returnable=false) are handed over as-is — no "prepare" alert.
    const prod = await prisma.product.findUnique({ where: { id: productId }, select: { returnable: true } });
    if (prod && prod.returnable === false) {
      return NextResponse.json({ skipped: true, reason: "give-away" }, { status: 200 });
    }

    const existing = sessionId
      ? await prisma.notification.findFirst({
          where: { productId, sessionId, status: { not: "COMPLETE" } },
          select: { id: true },
        })
      : null;

    const row = existing
      ? await prisma.notification.update({
          where: { id: existing.id },
          data: { isRead: false, ...(message !== undefined && { message }) },
          include: notifInclude,
        })
      : await prisma.notification.create({
          data: {
            type: "PREPARE_PRODUCT",
            title: title || "Prepare product sample",
            message: message || "",
            productId,
            customerId: customerId || null,
            sessionId: sessionId || null,
            status: "PENDING",
          },
          include: notifInclude,
        });

    // update-tak 13/9: reserve the document number AT PREPARE TIME (user request — showing
    // "—" until Complete was confusing). One session = one document: the first Prepare of a
    // session stamps NO{YY}{MM}{seq} on that session's takeaway notifications; later items
    // of the same session join the same number. Idempotent — already-numbered rows are
    // skipped, and assignDocNumbers only touches takeaway (qty>0) lines.
    if (!existing && sessionId && !row.docNo) {
      const BKK_OFFSET_MS = 7 * 3600 * 1000;
      const bkkDay = new Date(row.createdAt.getTime() + BKK_OFFSET_MS);
      const prefix = `NO${String(bkkDay.getUTCFullYear()).slice(2)}${String(bkkDay.getUTCMonth() + 1).padStart(2, "0")}`;
      const dayStartUtc = new Date(Date.UTC(bkkDay.getUTCFullYear(), bkkDay.getUTCMonth(), bkkDay.getUTCDate()) - BKK_OFFSET_MS);
      const docNo = await assignDocNumbers(prefix, { sessionId, from: dayStartUtc, to: new Date(dayStartUtc.getTime() + 24 * 3600 * 1000) });
      if (docNo) {
        row.docNo = docNo;
        // assignDocNumbers stamped the DB rows in bulk; re-read this one so the response
        // and broadcast carry the number.
        const fresh = await prisma.notification.findUnique({ where: { id: row.id }, include: notifInclude });
        if (fresh) Object.assign(row, fresh);
      }
    }

    const notification = await attachTakeaway(row); // include the takeaway quantity
    // Carry the row in the broadcast so subscribers update instantly without a refetch.
    await broadcastNotifications({ type: existing ? "update" : "create", notification });
    return NextResponse.json(notification, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error("NOTIF POST ERROR:", error);
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}

// PATCH (collection) — mark all unread notifications as read in one call.
export async function PATCH() {
  try {
    await prisma.notification.updateMany({ where: { isRead: false }, data: { isRead: true } });
    await broadcastNotifications({ type: "readAll" });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("NOTIF PATCH-ALL ERROR:", error);
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
