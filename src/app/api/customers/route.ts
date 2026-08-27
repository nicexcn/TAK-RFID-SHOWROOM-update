import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerTypePrefix } from "@/lib/customerTypes";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const title = searchParams.get("title") || "";
  // Optional registered-date range (YYYY-MM-DD) for the dashboard export; 'to' includes the whole day.
  const fromP = searchParams.get("from");
  const toP = searchParams.get("to");
  let createdAt: { gte?: Date; lte?: Date } | undefined;
  if (fromP || toP) {
    createdAt = {};
    if (fromP && !isNaN(new Date(fromP).getTime())) createdAt.gte = new Date(fromP);
    if (toP && !isNaN(new Date(toP).getTime())) { const d = new Date(toP); d.setHours(23, 59, 59, 999); createdAt.lte = d; }
  }
  const where = {
    AND: [
      title ? { title } : {},
      createdAt ? { createdAt } : {},
      search ? { OR: [
        { fullName: { contains: search, mode: "insensitive" as const } },
        { customerCode: { contains: search, mode: "insensitive" as const } },
        { phone: { contains: search } },
        { company: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ] } : {},
    ],
  };
  // Sorting: allow only real, indexable columns.
  const SORTABLE = new Set(["customerCode", "fullName", "title", "company", "phone", "email", "createdAt"]);
  const sortField = searchParams.get("sort") || "";
  const sortDir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const orderBy = SORTABLE.has(sortField) ? { [sortField]: sortDir } : { createdAt: "desc" as const };

  // No ?page → return the full array (back-compat: CSV export + any other consumer).
  const pageParam = searchParams.get("page");
  if (pageParam === null) {
    const customers = await prisma.customer.findMany({ where, orderBy });
    return NextResponse.json(customers);
  }
  // Paginated list view: also return the filtered total + per-type counts for the stats card.
  const page = Math.max(1, parseInt(pageParam, 10) || 1);
  const limit = 10;
  const [customers, total, grouped] = await Promise.all([
    prisma.customer.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit }),
    prisma.customer.count({ where }),
    prisma.customer.groupBy({ by: ["title"], where, _count: { _all: true } }),
  ]);
  const byTitle = grouped.map((g) => ({ title: g.title, count: g._count._all }));
  return NextResponse.json({ customers, total, page, totalPages: Math.ceil(total / limit), byTitle });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fullName, title, titleOther, company, phone, email, lineId, knowChannel, knowChannelOther, pdpaConsent, salesPerson, zone, project, source } = body;
  // Backstop: an "Other" occupation must be specified (the client also enforces this).
  if (title === "Other" && !String(titleOther || "").trim()) {
    return NextResponse.json({ error: "Please specify the occupation when 'Other' is selected." }, { status: 400 });
  }
  // Customer code = type prefix + zero-padded running number, e.g. "Ar00001" (see src/lib/customerTypes).
  // Highest-number-per-prefix + 1 (survives deletes; low-concurrency showroom so the race is acceptable).
  const prefix = customerTypePrefix(title);
  const last = await prisma.customer.findFirst({
    where: { customerCode: { startsWith: prefix } },
    orderBy: { customerCode: "desc" },
    select: { customerCode: true },
  });
  const lastNum = last ? parseInt(last.customerCode.slice(prefix.length), 10) || 0 : 0;
  const customerCode = `${prefix}${String(lastNum + 1).padStart(5, "0")}`;
  const customer = await prisma.customer.create({
    data: {
      customerCode, fullName, title,
      titleOther: title === "Other" ? titleOther : null,
      company, phone, email,
      lineId: lineId || null,
      knowChannel: knowChannel || [],
      knowChannelOther: knowChannel?.includes("Other") ? knowChannelOther : null,
      pdpaConsent: pdpaConsent || false,
      salesPerson: String(salesPerson || "").trim() || null,
      zone: String(zone || "").trim() || null,
      project: String(project || "").trim() || null,
      source: String(source || "").trim() || null,
    },
  });
  return NextResponse.json(customer, { status: 201 });
}
