import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// #8: a customer's contacts (Contact Name A/B/C/D). GET list · POST add · DELETE by { contactId }.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const contacts = await prisma.contact.findMany({ where: { customerId: id }, orderBy: { createdAt: "asc" } });
    return NextResponse.json(contacts);
  } catch (error) {
    console.error("CONTACTS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load contacts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { name, phone, note } = await req.json();
    if (!String(name || "").trim()) return NextResponse.json({ error: "Contact name required" }, { status: 400 });
    // Guard against a forged customerId — the contact must attach to a real customer.
    const exists = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    const contact = await prisma.contact.create({
      data: { customerId: id, name: String(name).trim(), phone: String(phone || "").trim(), note: String(note || "").trim() || null },
    });
    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error("CONTACTS POST ERROR:", error);
    return NextResponse.json({ error: "Failed to add contact" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { contactId } = await req.json().catch(() => ({}));
    if (!contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 });
    // Scope the delete to this customer so a contact can't be removed via another customer's id.
    const { count } = await prisma.contact.deleteMany({ where: { id: contactId, customerId: id } });
    if (!count) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("CONTACTS DELETE ERROR:", error);
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  }
}
