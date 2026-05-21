import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    let settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
    if (!settings) {
      settings = await prisma.appSettings.create({ data: { id: "singleton" } });
    }
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const settings = await prisma.appSettings.upsert({
      where: { id: "singleton" },
      update: body,
      create: { id: "singleton", ...body },
    });
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}