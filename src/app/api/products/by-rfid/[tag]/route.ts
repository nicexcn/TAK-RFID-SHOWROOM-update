import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: Promise<{ tag: string }> }) {
  try {
    const { tag } = await params;
    const product = await prisma.product.findUnique({
      where: { rfidTag: tag },
    });
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}