import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(product);
  } catch (error) {
    console.error("GET PRODUCT ERROR:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await req.json();
    const { rfidTag, brand, materialType, category, productCode, name, imageUrl } = data;
    const product = await prisma.product.update({
      where: { id },
      data: { rfidTag, brand, materialType, category, productCode, name, imageUrl },
    });
    return NextResponse.json(product);
  } catch (error) {
    console.error("PUT PRODUCT ERROR:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}