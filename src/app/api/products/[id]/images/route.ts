import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const images = await prisma.productImage.findMany({
      where: { productId: id },
      orderBy: { order: "asc" },
    });
    return NextResponse.json(images);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { url, order } = await req.json();
    const image = await prisma.productImage.create({
      data: { productId: id, url, order: order ?? 0 },
    });
    return NextResponse.json(image);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { imageId } = await req.json();
    await prisma.productImage.delete({ where: { id: imageId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}