import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: Promise<{ tag: string }> }) {
  try {
    const { tag } = await params;
    // Resolve through the tag table — a product may carry several chips (door panels: EPC1+EPC2),
    // and any of them must return the same product. Falls back to the legacy primary-tag column
    // for rows not yet backfilled into RfidTag.
    const tagRow = await prisma.rfidTag.findUnique({
      where: { epc: tag },
      include: { product: true },
    });
    const product = tagRow?.product ?? (await prisma.product.findUnique({ where: { rfidTag: tag } }));
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(product);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
