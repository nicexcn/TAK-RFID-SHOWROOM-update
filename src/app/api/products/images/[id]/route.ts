import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCover } from "@/lib/productCover";
import { requireAccess } from "@/lib/permissions";

// DELETE — remove one ProductImage (Media gallery delete button).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAccess(req, "/admin/products");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const image = await prisma.productImage.delete({ where: { id } });
    await syncCover(image.productId); // re-point the cover at the new first image (or clear it)
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("MEDIA DELETE ERROR:", error);
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }
}
