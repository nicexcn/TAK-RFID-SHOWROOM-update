import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeReaders } from "@/lib/readers";
import { normalizeDisplays } from "@/lib/displays";

// Public (TV has no login) display config — currently just the per-image slide
// duration so the showroom can tune the slideshow speed from Settings. Falls back
// to sane defaults if AppSettings hasn't been created yet.
export async function GET() {
  try {
    const s = await prisma.appSettings.findUnique({
      where: { id: "singleton" },
      select: {
        slideDuration: true, scheduleEnabled: true,
        scheduleOn: true, scheduleOff: true, scheduleDays: true, relayUrl: true, readers: true, displays: true, idleVideoUrl: true, displayRotation: true, idleVideoFit: true,
      },
    });
    return NextResponse.json({
      slideDuration: s?.slideDuration ?? 5,
      scheduleEnabled: s?.scheduleEnabled ?? false,
      scheduleOn: s?.scheduleOn ?? "08:00",
      scheduleOff: s?.scheduleOff ?? "18:00",
      scheduleDays: s?.scheduleDays ?? [],
      relayUrl: s?.relayUrl ?? "",
      readers: normalizeReaders(s?.readers),
      displays: normalizeDisplays(s?.displays),
      idleVideoUrl: s?.idleVideoUrl ?? "",
      displayRotation: s?.displayRotation ?? 0,
      idleVideoFit: s?.idleVideoFit === "cover" ? "cover" : "contain",
    });
  } catch {
    return NextResponse.json({ slideDuration: 5, scheduleEnabled: false, relayUrl: "", readers: [], displays: [], idleVideoUrl: "", displayRotation: 0, idleVideoFit: "contain" });
  }
}
