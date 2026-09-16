import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/permissions";

// Companies pages were removed (feedback round 3, 15/9) — this endpoint survives ONLY to feed
// the add/edit-customer company combobox (existing companies as datalist suggestions, so staff
// pick "Home Connect" instead of typing "home connect" and forking a new variant).
// The former POST (create) had no caller after the pages went away and was deleted.
export async function GET(req: NextRequest) {
  const guard = requireAccess(req, "/admin/customers");
  if ("response" in guard) return guard.response;
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
