import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, generateToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = generateToken({ id: user.id, username: user.username, role: user.role });

    const response = NextResponse.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
    response.cookies.set("token", token, { httpOnly: true, maxAge: 60 * 60 * 24 * 7 });

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}