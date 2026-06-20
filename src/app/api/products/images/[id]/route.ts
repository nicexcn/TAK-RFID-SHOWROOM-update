import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCover } from "@/lib/productCover";

// DELETE — remove one ProductImage (Media gallery delete button).
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
