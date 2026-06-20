import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastNotifications, broadcastDisplayChanged } from "@/lib/realtime";
import { notifInclude, attachTakeaway } from "@/lib/notifDetails";

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
