import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/permissions";

// Projects (TAK slides 8-9+11): one customer can have several projects; a visit
// is filed under one of them. ?customerId=<id> lists that customer's projects.
export async function GET(req: NextRequest) {
  const guard = requireAccess(req, "/admin/customers");
  if ("response" in guard) return guard.response;
  const customerId = new URL(req.url).searchParams.get("customerId");
  const projects = await prisma.project.findMany({
    where: customerId ? { customerId } : undefined,
    orderBy: { createdAt: "asc" },
    take: customerId ? undefined : 500,
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const guard = requireAccess(req, "/admin/customers");
  if ("response" in guard) return guard.response;
  try {
    const { customerId, name, zone, salesName, note } = await req.json();
    if (!customerId || !String(name || "").trim()) {
      return NextResponse.json({ error: "Customer and project name are required" }, { status: 400 });
    }
    // Upsert by the (customer, name) unique — picking an existing name returns it
    // instead of erroring, so the picker can "add" freely.
    const project = await prisma.project.upsert({
      where: { customerId_name: { customerId, name: String(name).trim() } },
      update: {
        zone: zone != null && String(zone).trim() !== "" ? String(zone).trim() : undefined,
        salesName: salesName != null && String(salesName).trim() !== "" ? String(salesName).trim() : undefined,
        note: typeof note === "string" ? note : undefined,
      },
      create: {
        customerId,
        name: String(name).trim(),
        zone: String(zone || "").trim() || null,
        salesName: String(salesName || "").trim() || null,
        note: typeof note === "string" ? note || null : null,
      },
    });
    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: "Could not save the project" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = requireAccess(req, "/admin/settings");
  if ("response" in guard) return guard.response;
  const { id } = await req.json();
  await prisma.project.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ success: true });
}
