import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { customerCode, customerId } = await req.json();

    // ปิด session เก่าทั้งหมด
    await prisma.session.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // สร้าง session ใหม่
    const session = await prisma.session.create({
      data: {
        customerCode,
        customerId: customerId || null,
        isActive: true,
      },
    });

    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await prisma.session.findFirst({
      where: { isActive: true },
      include: {
        scans: {
          include: {
            product: {
              include: { images: { orderBy: { order: "asc" } } },
            },
          },
          orderBy: { scannedAt: "desc" },
        },
      },
    });
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
