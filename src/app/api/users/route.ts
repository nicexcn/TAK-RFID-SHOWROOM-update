import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { isValidRole, passwordError } from "@/lib/validation";
import bcrypt from "bcryptjs";

// GET — list all users (super admin only)
export async function GET(req: NextRequest) {
  const guard = requireSuperAdmin(req);
  if ("response" in guard) return guard.response;
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, firstName: true, lastName: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error("USER LIST ERROR:", error);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

// POST — create user (super admin only)
export async function POST(req: NextRequest) {
  const guard = requireSuperAdmin(req);
  if ("response" in guard) return guard.response;
  try {
    const { username, password, firstName, lastName, role } = await req.json();
    if (!username || typeof username !== "string") return NextResponse.json({ error: "username required" }, { status: 400 });
    const pwErr = passwordError(password);
    if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });
    const finalRole = role ?? "user";
    if (!isValidRole(finalRole)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashed, firstName: firstName || "", lastName: lastName || "", role: finalRole },
      select: { id: true, username: true, firstName: true, lastName: true, role: true, createdAt: true },
    });
    return NextResponse.json(user);
  } catch (error) {
    console.error("USER CREATE ERROR:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}