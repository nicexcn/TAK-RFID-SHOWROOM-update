import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const customer = await prisma.customer.findUnique({ where: { id: params.id } });
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(customer);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const updated = await prisma.customer.update({ where: { id: params.id }, data: body });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.customer.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
