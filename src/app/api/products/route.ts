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
    const { rfidTag, brand, materialType, category, productCode, name, size, colour, description, location, imageUrl, isActive } = data;
    // imageUrl is a derived cover cache — never written directly. The initial image
    // (if any) becomes gallery image #0, and syncCover() sets the cover from it.
    const product = await prisma.product.create({
      data: { rfidTag, brand, materialType, category, productCode, name, size, colour, description, location, isActive },
    });
    if (imageUrl) {
      await prisma.productImage.create({ data: { productId: product.id, url: imageUrl, order: 0 } });
      await syncCover(product.id);
      return NextResponse.json({ ...product, imageUrl });
    }
    return NextResponse.json(product);
  } catch (error) {
    console.error("CREATE PRODUCT ERROR:", error);
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}