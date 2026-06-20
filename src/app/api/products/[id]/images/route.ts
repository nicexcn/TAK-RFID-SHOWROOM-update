import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCover } from "@/lib/productCover";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const images = await prisma.productImage.findMany({
      where: { productId: id },
      orderBy: { order: "asc" },
    });
    return NextResponse.json(images);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { url, order } = await req.json();
    const image = await prisma.productImage.create({
      data: { productId: id, url, order: order ?? 0 },
    });
    await syncCover(id); // the first image is the cover
    return NextResponse.json(image);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — reorder the gallery. Body: { order: string[] } (image ids, new order).
// Writes each image's `order` to its index, then re-syncs the cover (image #0).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { order } = await req.json();
    if (!Array.isArray(order) || order.some((x) => typeof x !== "string")) {
      return NextResponse.json({ error: "order must be an array of image ids" }, { status: 400 });
    }
    // Only touch images that actually belong to this product (ignore stray ids).
    const owned = new Set(
      (await prisma.productImage.findMany({ where: { productId: id }, select: { id: true } })).map((i) => i.id)
    );
    await prisma.$transaction(
      order
        .filter((imageId: string) => owned.has(imageId))
        .map((imageId: string, index: number) =>
          prisma.productImage.update({ where: { id: imageId }, data: { order: index } })
        )
    );
    await syncCover(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { imageId } = await req.json();
    await prisma.productImage.delete({ where: { id: imageId } });
    await syncCover(id); // re-point the cover at the new first image (or clear it)
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
