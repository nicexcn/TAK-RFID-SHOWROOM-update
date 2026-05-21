import "dotenv/config";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function GET() {
  try {
    const existing = await prisma.user.findUnique({ where: { username: "admin" } });
    if (existing) {
      return NextResponse.json({ message: "Admin already exists" });
    }

    const hashed = await hashPassword("admin1234");
    await prisma.user.create({
      data: {
        username: "admin",
        password: hashed,
        role: "admin",
        firstName: "Admin",
        lastName: "System",
        permissions: { dashboard: true, products: true, rfid: true },
      },
    });

    return NextResponse.json({ message: "Admin created successfully" });
  } catch (error) {
    console.error("SEED ERROR:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}