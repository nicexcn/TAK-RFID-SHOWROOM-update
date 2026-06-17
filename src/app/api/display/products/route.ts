import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public (allow-listed in proxy): the TV table-display has no login. Returns the
// minimal EPC -> product map the presence display needs to render placed tiles.
export async function GET() {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: {
        rfidTag: true,
        name: true,
        brand: true,
        category: true,
        materialType: true,
        imageUrl: true,
        images: { select: { url: true }, orderBy: { order: "asc" } },
      },
    });
    return NextResponse.json(products);
  } catch {
    return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
  }
}
