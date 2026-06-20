import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCover } from "@/lib/productCover";

// Bulk-attach already-uploaded image URLs to products (the "bulk photo drop"
// import). The client uploads each file directly to Supabase (signed URL), matches
// it to a product by filename, and sends groups here. Each group's urls are appended (in order)
// AFTER the product's existing images, so a re-run never clobbers prior images;
// for a product with no images, the first url becomes the cover via syncCover.
export async function POST(req: NextRequest) {
  try {
    const { groups } = await req.json();
    if (!Array.isArray(groups) || groups.length === 0) {
      return NextResponse.json({ error: "No image groups provided" }, { status: 400 });
    }

    const result = { added: 0, products: 0, failed: 0, errors: [] as string[] };

    for (const group of groups) {
      const productId = String(group?.productId || "");
      const urls = Array.isArray(group?.urls) ? group.urls.filter((u: unknown) => typeof u === "string" && u) : [];
      if (!productId || urls.length === 0) continue;
      try {
        const exists = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
        if (!exists) { result.failed += urls.length; result.errors.push(`Unknown product ${productId}`); continue; }

        const base = await prisma.productImage.count({ where: { productId } });
        await prisma.productImage.createMany({
          data: urls.map((url: string, i: number) => ({ productId, url, order: base + i })),
        });
        await syncCover(productId); // first image (order 0) becomes/stays the cover
        result.added += urls.length;
        result.products += 1;
      } catch (err) {
        result.failed += urls.length;
        result.errors.push(`Product ${productId}: ${String(err)}`);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("BULK IMAGES ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
