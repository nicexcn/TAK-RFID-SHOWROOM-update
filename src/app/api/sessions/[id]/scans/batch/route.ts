import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastDisplayChanged } from "@/lib/realtime";

interface ScanInput {
  productId?: string;
  rfidTag?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const { scans } = await req.json();

    if (!Array.isArray(scans) || scans.length === 0) {
      return NextResponse.json({ error: "scans array required" }, { status: 400 });
    }
    if (scans.length > 500) {
      return NextResponse.json({ error: "Max 500 scans per batch" }, { status: 400 });
    }

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || !session.isActive) {
      return NextResponse.json({ error: "Session not found or inactive" }, { status: 404 });
    }
    // F2b: heartbeat — scan activity keeps the session alive (resets the idle TTL)
    await prisma.session.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } });

    // Resolve + validate all referenced products in ONE query (no N+1).
    const wantedIds = [...new Set(scans.filter((s: ScanInput) => s.productId).map((s: ScanInput) => s.productId!))];
    const wantedTags = [...new Set(scans.filter((s: ScanInput) => !s.productId && s.rfidTag).map((s: ScanInput) => s.rfidTag!))];

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          ...(wantedIds.length ? [{ id: { in: wantedIds } }] : []),
          ...(wantedTags.length ? [{ rfidTag: { in: wantedTags } }] : []),
        ],
      },
      select: { id: true, rfidTag: true },
    });
    const validIds = new Set(products.map((p) => p.id));
    const tagToId = new Map(products.map((p) => [p.rfidTag, p.id]));

    // Dedup within the batch and drop unknown/inactive tags.
    const finalIds = new Set<string>();
    let unknown = 0;
    for (const s of scans as ScanInput[]) {
      const pid = s.productId && validIds.has(s.productId)
        ? s.productId
        : s.rfidTag
          ? tagToId.get(s.rfidTag)
          : undefined;
      if (pid) finalIds.add(pid);
      else unknown++;
    }

    // Race-proof insert: the @@unique([sessionId, productId]) backstop means
    // concurrent batches can't double-insert; skipDuplicates handles tags
    // already scanned in this session.
    const result = await prisma.scan.createMany({
      data: [...finalIds].map((productId) => ({
        productId,
        sessionId,
      })),
      skipDuplicates: true,
    });

    const created = result.count;
    // If this session is currently on the TV, nudge it to refetch live.
    if (created > 0) await broadcastDisplayChanged();
    const skipped = scans.length - created - unknown;

    // Return the persisted rows (real DB ids) for the batched products so the client can
    // reconcile its optimistic "ws-" ids → real ids (id-based merges/PATCH then all match).
    const rows = await prisma.scan.findMany({
      where: { sessionId, productId: { in: [...finalIds] } },
      select: { id: true, productId: true, prepareStatus: true, takeawayQty: true },
    });

    return NextResponse.json(
      { created, skipped, unknown, total: scans.length, scans: rows },
      { status: 201 }
    );
  } catch (error) {
    console.error("BATCH SCAN ERROR:", error);
    return NextResponse.json({ error: "Failed to save scans" }, { status: 500 });
  }
}
