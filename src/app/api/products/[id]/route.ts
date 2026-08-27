import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/permissions";

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
  const guard = requireAccess(req, "/admin/products");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const data = await req.json();
    // imageUrl is intentionally NOT writable here — it's a derived cover cache
    // owned solely by syncCover() (gallery image #0). See /api/products/[id]/images.
    const { rfidTag, brand, materialType, category, productCode, name, size, colour, description, location, returnable } = data;
    const product = await prisma.product.update({
      where: { id },
      // Empty tag → null so untagged products don't collide on the unique index.
      data: { rfidTag: String(rfidTag || "").trim() || null, brand, materialType, category, productCode, name, size, colour, description, location, returnable },
    });
    return NextResponse.json(product);
  } catch (error) {
    console.error("PUT PRODUCT ERROR:", error);
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAccess(req, "/admin/products");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    // ?purge=true — permanent removal even with scan history. Deletes the scans first
    // (Scan.product is FK-restricted), then the product (images/notifications cascade).
    // This DESTROYS the customer-interest history; it's the explicit "permanent delete".
    if (new URL(req.url).searchParams.get("purge") === "true") {
      await prisma.scan.deleteMany({ where: { productId: id } });
      await prisma.product.delete({ where: { id } });
      return NextResponse.json({ success: true, mode: "purged" });
    }
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

// PATCH { restore: true } — un-archive a soft-deleted product. Tries to recover its original
// RFID tag from the tombstone (tag·deleted·<id>) if that tag is now free; otherwise it keeps
// the tombstoned tag and reports tagRecovered:false so the UI can prompt for a new tag.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAccess(req, "/admin/products");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({})) as { restore?: boolean };
    if (!body.restore) return NextResponse.json({ error: "Nothing to do" }, { status: 400 });

    const prod = await prisma.product.findUnique({ where: { id }, select: { rfidTag: true } });
    if (!prod) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let rfidTag = prod.rfidTag;
    let tagRecovered = true; // true unless the original tag is taken
    const m = rfidTag?.match(/^(.+)·deleted·[^·]+$/);
    if (m) {
      const original = m[1];
      const taken = await prisma.product.findUnique({ where: { rfidTag: original }, select: { id: true } });
      if (taken) tagRecovered = false; // keep the tombstoned tag
      else rfidTag = original;
    }
    await prisma.product.update({ where: { id }, data: { isActive: true, rfidTag } });
    return NextResponse.json({ success: true, tagRecovered, rfidTag });
  } catch (error) {
    console.error("RESTORE PRODUCT ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}