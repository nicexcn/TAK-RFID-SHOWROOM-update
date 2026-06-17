import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE — remove one ProductImage (Media gallery delete button).
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.productImage.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("MEDIA DELETE ERROR:", error);
    return NextResponse.json({ error: "Failed to delete image" }, { status: 500 });
  }
}
