import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/permissions";

// GET — list all companies (with customer count). Optional ?search= for name filter.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const where = search ? { name: { contains: search, mode: "insensitive" as const } } : {};
    const companies = await prisma.company.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { customers: true } } },
    });
    return NextResponse.json(companies.map((c) => ({ ...c, customerCount: c._count.customers })));
  } catch (error) {
    return NextResponse.json({ error: "Failed to load companies" }, { status: 500 });
  }
}

// POST — create a company (name unique).
export async function POST(req: NextRequest) {
  const guard = requireAccess(req, "/admin/companies");
  if ("response" in guard) return guard.response;
  try {
    const { name, phone, email, address, zone, note } = await req.json();
    if (!name || !name.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const company = await prisma.company.create({
      data: { name: name.trim(), phone: phone || null, email: email || null, address: address || null, zone: zone || null, note: note || null },
    });
    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create company" }, { status: 500 });
  }
}
