import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastDisplayChanged } from "@/lib/realtime";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { rfidTag, deviceId } = await req.json();

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || !session.isActive) {
      return NextResponse.json({ error: "Session not found or inactive" }, { status: 404 });
    }

    const product = await prisma.product.findFirst({ where: { rfidTag, isActive: true } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Heartbeat: a scan keeps the session alive (mirrors the batch route) so a
    // handheld-only session isn't treated as idle/abandoned while staff are scanning.
    await prisma.session.update({ where: { id }, data: { lastSeenAt: new Date() } });

    // Idempotent: a product scanned twice in the same session returns the existing
    // scan instead of erroring on @@unique([sessionId, productId]).
    const scan = await prisma.scan.upsert({
      where: { sessionId_productId: { sessionId: id, productId: product.id } },
      update: {},
      create: {
        productId: product.id,
        sessionId: id,
        ...(deviceId ? { deviceId: String(deviceId) } : {}),
      },
      include: { product: true },
    });

    // Nudge the TV so a handheld scan shows up immediately, not on the slow poll.
    await broadcastDisplayChanged();
    return NextResponse.json(scan);
  } catch (error) {
    console.error("SCAN POST ERROR:", error);
    return NextResponse.json({ error: "Failed to save scan" }, { status: 500 });
  }
}
