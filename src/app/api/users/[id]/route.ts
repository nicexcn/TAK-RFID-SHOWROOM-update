import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { isValidRole, passwordError } from "@/lib/validation";
import bcrypt from "bcryptjs";

// PATCH — update username / password (super admin only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireSuperAdmin(req);
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const { username, password, firstName, lastName, role } = await req.json();
    const data: Record<string, string> = {};
    if (username) data.username = username;
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (role !== undefined) {
      if (!isValidRole(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      data.role = role;
    }
    if (password) {
      const pwErr = passwordError(password);
      if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
      data.password = await bcrypt.hash(password, 10);
    }
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, firstName: true, lastName: true, role: true, createdAt: true },
    });
    return NextResponse.json(user);
  } catch (error) {
    console.error("USER UPDATE ERROR:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

// DELETE — remove user (super admin only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireSuperAdmin(req);
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    if (guard.user.id === id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("USER DELETE ERROR:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}