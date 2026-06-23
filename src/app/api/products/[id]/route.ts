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
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await req.json();
    // imageUrl is intentionally NOT writable here — it's a derived cover cache
    // owned solely by syncCover() (gallery image #0). See /api/products/[id]/images.
    const { rfidTag, brand, materialType, category, productCode, name, size, colour, description, location } = data;
    const product = await prisma.product.update({
      where: { id },
      data: { rfidTag, brand, materialType, category, productCode, name, size, colour, description, location },
    });
    return NextResponse.json(product);
  } catch (error) {
    console.error("PUT PRODUCT ERROR:", error);
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // A product that has been scanned can't be hard-deleted — Scan.product is a required
    // relation (FK restrict) and those scans are customer-interest history we must keep.
    // So: no scans → truly delete (images + notifications cascade), which also frees the
    // RFID tag. Has scans → archive (isActive=false) AND free the tag (tombstone it) so the
    // physical chip can be reused; scan history references productId, so it stays intact.
    const scanCount = await prisma.scan.count({ where: { productId: id } });
    if (scanCount === 0) {
      await prisma.product.delete({ where: { id } });
      return NextResponse.json({ success: true, mode: "deleted" });
    }
    const prod = await prisma.product.findUnique({ where: { id }, select: { rfidTag: true } });
    await prisma.product.update({
      where: { id },
      data: { isActive: false, rfidTag: `${prod?.rfidTag ?? "tag"}·deleted·${id}` },
    });
    return NextResponse.json({ success: true, mode: "archived", reason: "has scan history" });
  } catch (error) {
    console.error("DELETE PRODUCT ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}