import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const type = searchParams.get("type") || "code";
  if (!q) return NextResponse.json(null);
  const customer = await prisma.customer.findFirst({
    where: type === "code"
      ? { customerCode: { equals: q, mode: "insensitive" } }
      : type === "name"
      ? { fullName: { contains: q, mode: "insensitive" } }
      : { phone: { contains: q.replace(/-/g, "") } },
  });
  return NextResponse.json(customer);
}
