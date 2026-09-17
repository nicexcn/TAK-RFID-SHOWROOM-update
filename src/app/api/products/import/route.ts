import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/permissions";

// Bulk product import (CSV-style rows). 16/9 multi-chip awareness: a door panel imported
// twice (EPC1 row + EPC2 row, same name) becomes ONE product with two tags instead of two
// products — if the incoming tag already exists as a RfidTag row, the row attaches to that
// product (and updates its fields); if a row's name matches an existing product, the tag is
// added to that product rather than creating a same-name duplicate.
export async function POST(req: NextRequest) {
  const guard = requireAccess(req, "/admin/products");
  if ("response" in guard) return guard.response;
  try {
    const { products } = await req.json();
    if (!Array.isArray(products) || products.length === 0) return NextResponse.json({ error: "No products data" }, { status: 400 });
    const results = { created: 0, updated: 0, tagsAdded: 0, failed: 0, errors: [] as string[] };
    for (const row of products) {
      const rfidTag = String(row.rfidTag || row["RFID Tag"] || row["rfid_tag"] || "").trim();
      const name = String(row.name || row["Product Name"] || row["product_name"] || "").trim();
      if (!rfidTag || !name) { results.failed++; results.errors.push(`Missing rfidTag or name: ${JSON.stringify(row)}`); continue; }
      try {
        const data = {
          name,
          brand: String(row.brand || row["Brand"] || "").trim() || null,
          materialType: String(row.materialType || row["Material Type"] || "").trim() || null,
          category: String(row.category || row["Category"] || "").trim() || null,
          productCode: String(row.productCode || row["Product Code"] || "").trim() || null,
          size: String(row.size || row["Size"] || "").trim() || null,
          colour: String(row.colour || row["Colour"] || "").trim() || null,
          description: String(row.description || row["Description"] || "").trim() || null,
          location: String(row.location || row["Location"] || "").trim() || null,
        };
        // 1) tag already on a product (RfidTag row) → update that product's fields
        const tagRow = await prisma.rfidTag.findUnique({ where: { epc: rfidTag }, include: { product: true } });
        if (tagRow) {
          await prisma.product.update({ where: { id: tagRow.productId }, data });
          results.updated++;
          continue;
        }
        // 2) tag is some product's PRIMARY (legacy rows not backfilled) → update it
        const existing = await prisma.product.findUnique({ where: { rfidTag } });
        if (existing) {
          await prisma.product.update({ where: { rfidTag }, data });
          await prisma.rfidTag.upsert({ where: { epc: rfidTag }, update: {}, create: { epc: rfidTag, productId: existing.id, label: "primary" } });
          results.updated++;
          continue;
        }
        // 3) same-name product exists (the second chip of a multi-chip item) → attach the tag
        const byName = await prisma.product.findFirst({ where: { name }, orderBy: { createdAt: "asc" } });
        if (byName) {
          await prisma.rfidTag.create({ data: { epc: rfidTag, productId: byName.id } });
          results.tagsAdded++;
          continue;
        }
        // 4) brand-new product; the incoming tag is its primary
        const created = await prisma.product.create({ data: { ...data, rfidTag } });
        await prisma.rfidTag.create({ data: { epc: rfidTag, productId: created.id, label: "primary" } });
        results.created++;
      } catch (err) { results.failed++; results.errors.push(`rfidTag ${rfidTag}: ${String(err)}`); }
    }
    return NextResponse.json(results);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
