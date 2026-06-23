import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCover } from "@/lib/productCover";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const all = searchParams.get("all") === "true";
    const limit = all ? 10000 : 10;

    const where: any = {
      isActive: true, // hide soft-deleted products from catalog + scan lookup
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { rfidTag: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(category && { category }),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({ products, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { rfidTag, brand, materialType, category, productCode, name, size, colour, description, location, imageUrl, imageUrls, isActive } = data;
    // imageUrl is a derived cover cache — never written directly. Initial images become
    // gallery images (in order); syncCover() sets the cover from image #0. Accept a list
    // (imageUrls) for multi-image create, or a single imageUrl for back-compat.
    const urls: string[] = (Array.isArray(imageUrls) ? imageUrls : imageUrl ? [imageUrl] : [])
      .filter((u: unknown): u is string => typeof u === "string" && !!u);
    const product = await prisma.product.create({
      data: { rfidTag, brand, materialType, category, productCode, name, size, colour, description, location, isActive },
    });
    if (urls.length) {
      await prisma.productImage.createMany({ data: urls.map((url, i) => ({ productId: product.id, url, order: i })) });
      await syncCover(product.id);
      return NextResponse.json({ ...product, imageUrl: urls[0] });
    }
    return NextResponse.json(product);
  } catch (error) {
    console.error("CREATE PRODUCT ERROR:", error);
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}