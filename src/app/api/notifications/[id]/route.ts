import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, isRead } = await req.json();
  const updated = await prisma.notification.update({
    where: { id },
    data: {
      ...(status !== undefined && { status }),
      ...(isRead !== undefined && { isRead }),
    },
  });
  return NextResponse.json(updated);
}
