import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Customer search for the scan entry points (Surface Scan / Manual Scan).
// Returns an ARRAY (cap 20): a name/company match can hit several customers,
// and staff need to pick the right one — findFirst hid the rest (the
// "duplicate-name shows only one" bug). The caller auto-selects when there's
// exactly one (e.g. a code/phone match) and shows a list when there are more.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const type = searchParams.get("type") || "code";
  if (!q) return NextResponse.json([]);
  const where =
    type === "code"
      ? { customerCode: { equals: q, mode: "insensitive" as const } }
      : type === "name"
      ? { fullName: { contains: q, mode: "insensitive" as const } }
      : type === "company"
      ? { company: { contains: q, mode: "insensitive" as const } }
      : { phone: { contains: q.replace(/-/g, "") } };
  const customers = await prisma.customer.findMany({
    where,
    select: { id: true, customerCode: true, fullName: true, company: true, phone: true },
    take: 20,
    orderBy: { customerCode: "asc" },
  });
  return NextResponse.json(customers);
}
