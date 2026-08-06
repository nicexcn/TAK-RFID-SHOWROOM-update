import { NextResponse } from "next/server";
import { broadcastDisplayIdentify } from "@/lib/realtime";

// POST — "Identify screens": fan out a realtime ping so every open /display flashes its own
// name, letting staff match the on-screen label to the physical TV. Authenticated (staff-only;
// see proxy.ts — this path is carved out of the public /api/display allow-list). No body needed.
export async function POST() {
  try {
    await broadcastDisplayIdentify();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to identify" }, { status: 500 });
  }
}
