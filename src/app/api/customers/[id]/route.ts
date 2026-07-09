import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const customer = await prisma.customer.findUnique({ where: { id }, include: { contacts: { orderBy: { createdAt: "asc" } } } });
    if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Interest history: which products this customer scanned, across their sessions
    // (customer req #3: track which customer scanned which product, when).
    const sessions = await prisma.session.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      include: {
        scans: {
          orderBy: { scannedAt: "desc" },
          include: { product: { select: { id: true, name: true, rfidTag: true, imageUrl: true, location: true, brand: true, returnable: true } } },
        },
      },
    });
    return NextResponse.json({ ...customer, sessions });
  } catch (error) {
    console.error("CUSTOMER GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load customer" }, { status: 500 });
  }
}

// Whitelist updatable fields — never spread the raw request body into prisma
// (mass-assignment guard).
const ALLOWED = [
  "fullName", "title", "titleOther", "company", "phone",
  "email", "lineId", "knowChannel", "knowChannelOther", "pdpaConsent",
  "salesPerson", "project", "source",
];

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const k of ALLOWED) if (k in body) data[k] = body[k];
    if ("salesPerson" in data) data.salesPerson = String(data.salesPerson || "").trim() || null;
    if ("project" in data) data.project = String(data.project || "").trim() || null;
    if ("source" in data) data.source = String(data.source || "").trim() || null;
    const updated = await prisma.customer.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("CUSTOMER PUT ERROR:", error);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // End any active sessions for this customer first, so deleting them never
    // leaves a dangling active session pointing at a now-deleted customer.
    // Sessions link via customerCode (always set) and/or customerId (set only when
    // started from a looked-up customer) — match both.
    const customer = await prisma.customer.findUnique({ where: { id }, select: { customerCode: true } });
    if (customer) {
      await prisma.session.updateMany({
        where: { isActive: true, OR: [{ customerId: id }, { customerCode: customer.customerCode }] },
        data: { isActive: false },
      });
    }
    await prisma.customer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("CUSTOMER DELETE ERROR:", error);
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
