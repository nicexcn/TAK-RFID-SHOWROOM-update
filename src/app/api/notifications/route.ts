import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const notifications = await prisma.notification.findMany({
    where: unreadOnly ? { isRead: false } : {},
    include: {
      product: { select: { id: true, name: true, productCode: true, location: true } },
      customer: { select: { id: true, customerCode: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(notifications);
}

export async function POST(req: NextRequest) {
  const { productId, customerId, sessionId, title, message } = await req.json();
  const notification = await prisma.notification.create({
    data: {
      type: "PREPARE_PRODUCT",
      title: title || "เตรียมสินค้าตัวอย่าง",
      message: message || "",
      productId,
      customerId: customerId || null,
      sessionId: sessionId || null,
      status: "PENDING",
    },
    include: {
      product: { select: { id: true, name: true, productCode: true, location: true } },
      customer: { select: { id: true, customerCode: true, fullName: true } },
    },
  });
  return NextResponse.json(notification, { status: 201 });
}
