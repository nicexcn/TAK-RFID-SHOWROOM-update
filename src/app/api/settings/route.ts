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
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const ALLOWED = [
  "defaultFilter", "yearA", "yearB", "graphColor", "takeawayLimit", "takeawayEnabled",
  "visibleWidgets", "slideDuration", "sessionTimeout", "scheduleEnabled",
  "scheduleOn", "scheduleOff", "scheduleDays",
];

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    // Whitelist — never spread the raw body into prisma (and unknown keys throw).
    const data: Record<string, unknown> = {};
    for (const k of ALLOWED) if (k in body) data[k] = body[k];
    const settings = await prisma.appSettings.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
    });
    return NextResponse.json(settings);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}