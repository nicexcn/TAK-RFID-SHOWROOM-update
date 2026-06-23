import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateIdleCache } from "@/lib/sessionConfig";
import { normalizeReaders } from "@/lib/readers";

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
  "scheduleOn", "scheduleOff", "scheduleDays", "relayUrl", "readers", "borrowDays",
];

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    // Whitelist — never spread the raw body into prisma (and unknown keys throw).
    const data: Record<string, unknown> = {};
    for (const k of ALLOWED) if (k in body) data[k] = body[k];
    // The reader registry is free-form JSON from the client — coerce to a clean shape.
    if ("readers" in data) data.readers = normalizeReaders(data.readers);
    // Borrow period must be a positive integer (1..365 days); non-numeric falls back to 14.
    if ("borrowDays" in data) {
      const n = Math.floor(Number(data.borrowDays));
      data.borrowDays = Number.isFinite(n) ? Math.max(1, Math.min(365, n)) : 14;
    }
    const settings = await prisma.appSettings.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
    });
    if ("sessionTimeout" in data) invalidateIdleCache(); // apply the new idle window immediately
    return NextResponse.json(settings);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}