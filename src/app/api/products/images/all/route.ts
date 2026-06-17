import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — every product image, for the Media gallery in Settings.
export async function GET() {
  try {
    const images = await prisma.productImage.findMany({
      include: { product: { select: { name: true, productCode: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(images);
  } catch (error) {
    console.error("MEDIA LIST ERROR:", error);
    return NextResponse.json({ error: "Failed to load media" }, { status: 500 });
  }
}
