import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// PATCH — update username / password
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { username, password, firstName, lastName, role } = await req.json();
    const data: Record<string, string> = {};
    if (username) data.username = username;
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (role) data.role = role;
    if (password) data.password = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, firstName: true, lastName: true, role: true, createdAt: true },
    });
    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE — remove user
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}