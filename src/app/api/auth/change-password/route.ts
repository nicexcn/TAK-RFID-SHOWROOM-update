import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, hashPassword, verifyToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentPassword, newPassword } = await req.json();

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const isValid = await comparePassword(currentPassword, dbUser.password);
    if (!isValid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}