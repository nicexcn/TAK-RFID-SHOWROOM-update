import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
  let rfidTag = ""; // hoisted so the catch can name the conflicting tag without re-reading the body
  try {
    const data = await req.json();
    rfidTag = data.rfidTag;
    const { brand, materialType, category, productCode, name, size, colour, description, location, imageUrl, imageUrls, isActive } = data;
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
    // Duplicate RFID tag (the only unique field) — a normal data-entry mistake, so give a
    // clear message instead of a generic 500. The conflicting product may be soft-deleted
    // (isActive:false) and hidden from the catalog, which makes the tag look free but isn't.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const tag = String(rfidTag || "").trim();
      const existing = tag
        ? await prisma.product.findUnique({ where: { rfidTag: tag }, select: { name: true, isActive: true } }).catch(() => null)
        : null;
      const who = existing?.name ? ` by “${existing.name}”` : "";
      const hint = existing && existing.isActive === false ? " — it belongs to a deleted/inactive product" : "";
      return NextResponse.json(
        { error: `RFID tag “${tag}” is already in use${who}${hint}.` },
        { status: 409 },
      );
    }
    console.error("CREATE PRODUCT ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}