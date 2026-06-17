import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { products } = await req.json();
    if (!Array.isArray(products) || products.length === 0) return NextResponse.json({ error: "No products data" }, { status: 400 });
    const results = { created: 0, updated: 0, failed: 0, errors: [] as string[] };
    for (const row of products) {
      const rfidTag = String(row.rfidTag || row["RFID Tag"] || row["rfid_tag"] || "").trim();
      const name = String(row.name || row["Product Name"] || row["product_name"] || "").trim();
      if (!rfidTag || !name) { results.failed++; results.errors.push(`Missing rfidTag or name: ${JSON.stringify(row)}`); continue; }
      try {
        const existing = await prisma.product.findUnique({ where: { rfidTag } });
        const data = {
          name, rfidTag,
          brand: String(row.brand || row["Brand"] || "").trim() || null,
          materialType: String(row.materialType || row["Material Type"] || "").trim() || null,
          category: String(row.category || row["Category"] || "").trim() || null,
          productCode: String(row.productCode || row["Product Code"] || "").trim() || null,
          size: String(row.size || row["Size"] || "").trim() || null,
          colour: String(row.colour || row["Colour"] || "").trim() || null,
          description: String(row.description || row["Description"] || "").trim() || null,
          location: String(row.location || row["Location"] || "").trim() || null,
        };
        if (existing) { await prisma.product.update({ where: { rfidTag }, data }); results.updated++; }
        else { await prisma.product.create({ data }); results.created++; }
      } catch (err) { results.failed++; results.errors.push(`rfidTag ${rfidTag}: ${String(err)}`); }
    }
    return NextResponse.json(results);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
