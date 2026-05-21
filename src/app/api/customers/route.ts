import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const title = searchParams.get("title") || "";
  const customers = await prisma.customer.findMany({
    where: {
      AND: [
        title ? { title } : {},
        search ? { OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { customerCode: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
          { company: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ]} : {},
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(customers);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fullName, title, titleOther, company, phone, email, lineId, knowChannel, knowChannelOther, pdpaConsent } = body;
  const count = await prisma.customer.count();
  const customerCode = `C${String(count + 1).padStart(4, "0")}`;
  const customer = await prisma.customer.create({
    data: {
      customerCode, fullName, title,
      titleOther: title === "Other" ? titleOther : null,
      company, phone, email,
      lineId: lineId || null,
      knowChannel: knowChannel || [],
      knowChannelOther: knowChannel?.includes("Other") ? knowChannelOther : null,
      pdpaConsent: pdpaConsent || false,
    },
  });
  return NextResponse.json(customer, { status: 201 });
}
