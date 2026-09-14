import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/permissions";

// GET — one company + its customers (with their contacts/projects summary).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        customers: {
          orderBy: { createdAt: "desc" },
          select: { id: true, customerCode: true, fullName: true, title: true, phone: true, email: true, company: true, salesPerson: true, zone: true },
        },
      },
    });
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(company);
  } catch (error) {
    return NextResponse.json({ error: "Failed to load company" }, { status: 500 });
  }
}

// PATCH — edit company-level fields.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAccess(req, "/admin/companies");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const { name, phone, email, address, zone, note } = await req.json();
    const data: Record<string, string | null> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (phone !== undefined) data.phone = String(phone).trim() || null;
    if (email !== undefined) data.email = String(email).trim() || null;
    if (address !== undefined) data.address = String(address).trim() || null;
    if (zone !== undefined) data.zone = String(zone).trim() || null;
    if (note !== undefined) data.note = String(note).trim() || null;
    const updated = await prisma.company.update({ where: { id }, data });
    // Keep the denormalized `company` String on Customer in sync if the name changed.
    if (data.name) {
      await prisma.customer.updateMany({ where: { companyId: id }, data: { company: data.name } });
    }
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update company" }, { status: 500 });
  }
}

// DELETE — delete company (unlinks customers via onDelete: SetNull, doesn't delete them).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAccess(req, "/admin/companies");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    await prisma.company.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete company" }, { status: 500 });
  }
}
