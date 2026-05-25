import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// GET — list all users
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, firstName: true, lastName: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST — create user
export async function POST(req: NextRequest) {
  try {
    const { username, password, firstName, lastName, role } = await req.json();
    if (!username || !password) return NextResponse.json({ error: "username and password required" }, { status: 400 });
    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, password: hashed, firstName: firstName || "", lastName: lastName || "", role: role || "user" },
      select: { id: true, username: true, firstName: true, lastName: true, role: true, createdAt: true },
    });
    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}