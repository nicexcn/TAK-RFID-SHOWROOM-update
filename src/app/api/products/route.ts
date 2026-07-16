import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncCover } from "@/lib/productCover";
import { requireAccess } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const all = searchParams.get("all") === "true";
    const limit = all ? 10000 : 10;
    // status: active (default — hides archived from catalog + scan lookup) | archived | all
    const status = (searchParams.get("status") || "active").toLowerCase();
    // Sorting: only allow real, indexable columns (never interpolate arbitrary input into orderBy).
    const SORTABLE = new Set(["name", "brand", "materialType", "category", "productCode", "createdAt"]);
    const sortField = searchParams.get("sort") || "";
    const sortDir = searchParams.get("dir") === "asc" ? "asc" : "desc";
    const orderBy = SORTABLE.has(sortField) ? { [sortField]: sortDir } : { createdAt: "desc" as const };

    const where: any = {
      ...(status === "archived" ? { isActive: false } : status === "all" ? {} : { isActive: true }),
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
        orderBy,
        // Catalog view needs each product's scan count (to label Delete vs Archive); the
        // scan-lookup map (all=true) doesn't, so keep that path lean.
        ...(all ? {} : { include: { _count: { select: { scans: true } } } }),
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
  const guard = requireAccess(req, "/admin/products");
  if ("response" in guard) return guard.response;
  let rfidTag = ""; // hoisted so the catch can name the conflicting tag without re-reading the body
  try {
    const data = await req.json();
    rfidTag = String(data.rfidTag || "").trim();
    const { brand, materialType, category, productCode, name, size, colour, description, location, imageUrl, imageUrls, isActive, returnable } = data;

    // RFID tag reuse: a tag can be held by a SOFT-DELETED product (hidden from the catalog
    // but still occupying the unique tag). Free it so the physical chip can be re-stuck on a
    // new product. A tag held by an ACTIVE product is a real conflict → clear 409.
    if (rfidTag) {
      const holder = await prisma.product.findUnique({ where: { rfidTag }, select: { id: true, name: true, isActive: true } });
      if (holder?.isActive) {
        return NextResponse.json({ error: `RFID tag “${rfidTag}” is already in use by “${holder.name}”.` }, { status: 409 });
      }
      if (holder) {
        await prisma.product.update({ where: { id: holder.id }, data: { rfidTag: `${rfidTag}·deleted·${holder.id}` } });
      }
    }

    // imageUrl is a derived cover cache — never written directly. Initial images become
    // gallery images (in order); syncCover() sets the cover from image #0. Accept a list
    // (imageUrls) for multi-image create, or a single imageUrl for back-compat.
    const urls: string[] = (Array.isArray(imageUrls) ? imageUrls : imageUrl ? [imageUrl] : [])
      .filter((u: unknown): u is string => typeof u === "string" && !!u);
    const product = await prisma.product.create({
      data: { rfidTag, brand, materialType, category, productCode, name, size, colour, description, location, isActive, returnable: returnable !== false },
    });
    if (urls.length) {
      await prisma.productImage.createMany({ data: urls.map((url, i) => ({ productId: product.id, url, order: i })) });
      await syncCover(product.id);
      return NextResponse.json({ ...product, imageUrl: urls[0] });
    }
    return NextResponse.json(product);
  } catch (error) {
    // Backstop for a race between the holder check above and the insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: `RFID tag “${rfidTag}” is already in use.` }, { status: 409 });
    }
    console.error("CREATE PRODUCT ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}