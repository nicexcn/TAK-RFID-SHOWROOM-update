import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function GET() {
  try {
    await prisma.user.deleteMany({ where: { username: "admin" } });
    const hashed = await hashPassword("admin1234");
    await prisma.user.create({
      data: { username: "admin", password: hashed, role: "admin" },
    });
    return NextResponse.json({ message: "Admin reset successfully" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}