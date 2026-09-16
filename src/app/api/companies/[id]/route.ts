import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/permissions";

// GET — one company (name/zone/…) for the add-customer ?companyId= prefill. The company profile
// page and the PATCH/DELETE handlers were removed (feedback round 3, 15/9) — company data is
// now maintained implicitly: the customer form resolves the typed company string to an existing
// Company row case-insensitively (see /api/customers POST/PUT) and reuses its canonical name.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAccess(req, "/admin/customers");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true, name: true, phone: true, email: true, address: true, zone: true, note: true },
    });
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(company);
  } catch (error) {
    return NextResponse.json({ error: "Failed to load company" }, { status: 500 });
  }
}
