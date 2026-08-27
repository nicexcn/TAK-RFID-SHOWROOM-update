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
    const { code, name } = await req.json();
    if (!String(code || "").trim() || !String(name || "").trim()) {
      return NextResponse.json({ error: "Code and name are required" }, { status: 400 });
    }
    const sale = await prisma.sale.upsert({
      where: { code: String(code).trim().toUpperCase() },
      update: { name: String(name).trim() },
      create: { code: String(code).trim().toUpperCase(), name: String(name).trim() },
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
