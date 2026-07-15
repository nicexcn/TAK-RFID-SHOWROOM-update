import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateIdleCache } from "@/lib/sessionConfig";
import { normalizeReaders } from "@/lib/readers";
import { normalizeDisplays } from "@/lib/displays";
import { requireAccess } from "@/lib/permissions";

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
  "defaultFilter", "graphColor", "takeawayLimit", "takeawayEnabled",
  "visibleWidgets", "slideDuration", "sessionTimeout", "scheduleEnabled",
  "scheduleOn", "scheduleOff", "scheduleDays", "relayUrl", "readers", "displays", "borrowDays", "idleVideoUrl", "displayRotation", "idleVideoFit",
];

export async function PUT(req: NextRequest) {
  const guard = requireAccess(req, "/admin/settings");
  if ("response" in guard) return guard.response;
  try {
    const body = await req.json();
    // Whitelist — never spread the raw body into prisma (and unknown keys throw).
    const data: Record<string, unknown> = {};
    for (const k of ALLOWED) if (k in body) data[k] = body[k];
    // The reader registry is free-form JSON from the client — coerce to a clean shape.
    if ("readers" in data) data.readers = normalizeReaders(data.readers);
    // Same for the display (TV screen) registry.
    if ("displays" in data) data.displays = normalizeDisplays(data.displays);
    // Borrow period must be a positive integer (1..365 days); non-numeric falls back to 14.
    if ("borrowDays" in data) {
      const n = Math.floor(Number(data.borrowDays));
      data.borrowDays = Number.isFinite(n) ? Math.max(1, Math.min(365, n)) : 14;
    }
    // Display rotation must be one of 0/90/180/270.
    if ("displayRotation" in data) {
      data.displayRotation = [0, 90, 180, 270].includes(Number(data.displayRotation)) ? Number(data.displayRotation) : 0;
    }
    // Idle video fit must be "contain" (Fit) or "cover" (Fill).
    if ("idleVideoFit" in data) {
      data.idleVideoFit = data.idleVideoFit === "cover" ? "cover" : "contain";
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