import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { rfidTag } = await req.json();

    const product = await prisma.product.findUnique({ where: { rfidTag } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const scan = await prisma.scan.create({
      data: {
        productId: product.id,
        sessionId: id,
      },
      include: { product: true },
    });

    return NextResponse.json(scan);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}