import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "8");

    const products = await prisma.product.findMany({
      where: { name: { contains: search, mode: "insensitive" } },
      select: { name: true },
      distinct: ["name"],
      take: limit,
      orderBy: { name: "asc" },
    });

    return NextResponse.json(products.map((p) => p.name));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}