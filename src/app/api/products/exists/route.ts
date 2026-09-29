import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/permissions";

// 17/9: duplicate pre-check for the product import flow — how many of the incoming
// rfidTags / names already exist? (The import itself upserts by tag / attaches tags by
// name, so ANY match means existing data will change — the UI asks before proceeding.)
export async function GET(req: NextRequest) {
  const guard = requireAccess(req, "/admin/products");
  if ("response" in guard) return guard.response;
  try {
    const { searchParams } = new URL(req.url);
    const tags = (searchParams.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean);
    const names = (searchParams.get("names") || "").split(",").map((n) => n.trim()).filter(Boolean);
    if (tags.length === 0 && names.length === 0) return NextResponse.json({ count: 0 });

    const [byTag, byName] = await Promise.all([
      tags.length
        ? prisma.product.findMany({ where: { rfidTag: { in: tags } }, select: { id: true, rfidTag: true }, take: 10000 })
        : Promise.resolve([] as { id: string; rfidTag: string | null }[]),
      names.length
        ? prisma.product.findMany({ where: { name: { in: names } }, select: { id: true }, take: 10000 })
        : Promise.resolve([] as { id: string }[]),
    ]);
    // A product matched by BOTH tag and name is one row — dedupe by id.
    const ids = new Set([...byTag.map((p) => p.id), ...byName.map((p) => p.id)]);
    return NextResponse.json({ count: ids.size });
  } catch (error) {
    console.error("PRODUCTS EXISTS ERROR:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
