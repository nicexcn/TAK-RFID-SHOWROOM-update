import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastNotifications, broadcastDisplayChanged } from "@/lib/realtime";
import { notifInclude, attachTakeaway } from "@/lib/notifDetails";
import { assignDocNumbers } from "@/lib/erpDocNo";

const VALID_STATUS = ["PENDING", "PREPARING", "COMPLETE"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { status, isRead } = await req.json();
    if (status !== undefined && !VALID_STATUS.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(isRead !== undefined && { isRead }),
      },
      include: notifInclude,
    });

    // Keep the scan's prepare status in sync, so the floor staff's scan page (and the TV)
    // see "กำลังเตรียม / พร้อมแล้ว" when the prep staff act on the notification.
    if ((status === "PREPARING" || status === "COMPLETE") && updated.sessionId) {
      await prisma.scan.updateMany({
        where: { sessionId: updated.sessionId, productId: updated.productId },
        data: { prepareStatus: status },
      });
      await broadcastDisplayChanged();
    }

    // ERP document number (TAK slide 26 + template on slide 27): the FIRST completion in a
    // (customer, Bangkok-day) prep batch stamps NO{YY}{MM}{seq} on every takeaway notification
    // of that batch (mockup: NO26080001). Persisted server-side so numbers are stable across
    // reloads — replacing the old client-side recomputation that drifted when older
    // notifications arrived later.
    if (status === "COMPLETE" && !updated.docNo && updated.customerId) {
      const BKK_OFFSET_MS = 7 * 3600 * 1000;
      const bkkDay = new Date(updated.createdAt.getTime() + BKK_OFFSET_MS);
      const prefix = `NO${String(bkkDay.getUTCFullYear()).slice(2)}${String(bkkDay.getUTCMonth() + 1).padStart(2, "0")}`;
      const dayStartUtc = new Date(Date.UTC(bkkDay.getUTCFullYear(), bkkDay.getUTCMonth(), bkkDay.getUTCDate()) - BKK_OFFSET_MS);
      const docNo = await assignDocNumbers(prefix, { customerId: updated.customerId, from: dayStartUtc, to: new Date(dayStartUtc.getTime() + 24 * 3600 * 1000) });
      if (docNo) {
        await broadcastNotifications({ type: "update", notification: { ...updated, docNo } });
      }
    }

    const notification = await attachTakeaway(updated);
    await broadcastNotifications({ type: "update", notification });
    return NextResponse.json(notification);
  } catch (error) {
    console.error("NOTIF PATCH ERROR:", error);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.notification.deleteMany({ where: { id } });
    await broadcastNotifications({ type: "delete", id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("NOTIF DELETE ERROR:", error);
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }
}
