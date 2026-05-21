import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = 10;

    const where: any = {
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
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    console.log("CREATE PRODUCT DATA:", data);
    const { rfidTag, brand, materialType, category, productCode, name, size, colour, description, imageUrl, isActive } = data;
    const product = await prisma.product.create({
      data: { rfidTag, brand, materialType, category, productCode, name, size, colour, description, imageUrl, isActive },
    });
    return NextResponse.json(product);
  } catch (error) {
    console.error("CREATE PRODUCT ERROR:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}