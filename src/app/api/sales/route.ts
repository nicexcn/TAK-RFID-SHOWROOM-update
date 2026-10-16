import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/permissions";

// Sales master list (TAK slides 3+28): the TWC salesforce with ERP codes.
// Read by any signed-in staff (needed to pick a sale on the customer form);
// writes restricted to pages that can access Settings.
export async function GET(req: NextRequest) {
  const guard = requireAccess(req, "/admin/customers");
  if ("response" in guard) return guard.response;
  const sales = await prisma.sale.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json(sales);
}

export async function POST(req: NextRequest) {
  const guard = requireAccess(req, "/admin/settings");
  if ("response" in guard) return guard.response;
  try {
    // 15/10 (TAK feedback): adds carry ชื่อ + อาชีพที่ดูแล (segment) + พื้นที่ที่ดูแล (area).
    // Segment/area are free-form comma-separated strings, same as the seeded master.
    const { code, name, segment, province, zone } = await req.json();
    if (!String(name || "").trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    // No code given (the add form only asks ชื่อ/อาชีพ/พื้นที่) → next T####.
    let codeVal = String(code || "").trim().toUpperCase();
    if (!codeVal) {
      const last = await prisma.sale.findFirst({
        where: { code: { startsWith: "T" } },
        orderBy: { code: "desc" },
        select: { code: true },
      });
      const n = last ? parseInt(last.code.replace(/\D/g, ""), 10) + 1 : 1;
      codeVal = `T${String(n).padStart(4, "0")}`;
    }
    const sale = await prisma.sale.upsert({
      where: { code: codeVal },
      update: {
        name: String(name).trim(),
        segment: String(segment || "").trim() || null,
        province: String(province || "").trim() || null,
        zone: String(zone || "").trim() || null,
      },
      create: {
        code: codeVal,
        name: String(name).trim(),
        segment: String(segment || "").trim() || null,
        province: String(province || "").trim() || null,
        zone: String(zone || "").trim() || null,
      },
    });
    return NextResponse.json(sale);
  } catch {
    return NextResponse.json({ error: "Could not save the sale" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = requireAccess(req, "/admin/settings");
  if ("response" in guard) return guard.response;
  const { id } = await req.json();
  await prisma.sale.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ success: true });
}

// 16/9: edit a sale's coverage (จังหวัด/เขต, comma-separated as seeded from TWC's sheet).
// 15/10: also อาชีพที่ดูแล (segment). Empty strings clear back to null.
export async function PATCH(req: NextRequest) {
  const guard = requireAccess(req, "/admin/settings");
  if ("response" in guard) return guard.response;
  try {
    const { id, segment, province, zone } = await req.json();
    if (!String(id || "").trim()) return NextResponse.json({ error: "id required" }, { status: 400 });
    const sale = await prisma.sale.update({
      where: { id },
      data: {
        segment: String(segment || "").trim() || null,
        province: String(province || "").trim() || null,
        zone: String(zone || "").trim() || null,
      },
    });
    return NextResponse.json(sale);
  } catch {
    return NextResponse.json({ error: "Could not update the sale" }, { status: 500 });
  }
}
