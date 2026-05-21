import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();

    // mark session ว่า ready to display
    await prisma.session.update({
      where: { id: sessionId },
      data: { isActive: true },
    });

    return NextResponse.json({ success: true });
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
              include: {
                images: { orderBy: { order: "asc" } },
              },
            },
          },
          orderBy: { scannedAt: "asc" },
        },
      },
    });
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}