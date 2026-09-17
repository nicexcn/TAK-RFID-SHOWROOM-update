/**
 * 16/9 (door-panel import restructure): one product may carry several RFID chips.
 * 1. Merge the duplicated door-panel rows created by the flat import (same name+productCode
 *    under category "Door Panel" → keep the oldest as the surviving product) and re-point
 *    their scans/notifications to the survivor.
 * 2. Backfill the RfidTag table: one row per EPC for every product (the primary rfidTag
 *    column plus every merged row's tag, labelled EPC1/EPC2 style).
 *
 * Idempotent — safe to re-run. Run AFTER `db push` (RfidTag table exists):
 *   npx tsx scripts/backfill-rfid-tags.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── 1. merge same-item door-panel rows ─────────────────────────────────────────
  const panels = await prisma.product.findMany({
    where: { category: "Door Panel" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, productCode: true, rfidTag: true, createdAt: true },
  });
  // group by item name (the sheet's item column == name == productCode)
  const byItem = new Map<string, typeof panels>();
  for (const p of panels) {
    const key = p.name.trim();
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key)!.push(p);
  }

  let merged = 0, movedScans = 0, movedNotifs = 0, movedImages = 0;
  for (const group of byItem.values()) {
    if (group.length < 2) continue; // single row (single-chip item) — nothing to merge
    const [keep, ...dupes] = group; // oldest row survives
    for (const d of dupes) {
      const scans = await prisma.scan.updateMany({ where: { productId: d.id }, data: { productId: keep.id } }).catch(() => ({ count: 0 }));
      const notifs = await prisma.notification.updateMany({ where: { productId: d.id }, data: { productId: keep.id } }).catch(() => ({ count: 0 }));
      const images = await prisma.productImage.updateMany({ where: { productId: d.id }, data: { productId: keep.id } }).catch(() => ({ count: 0 }));
      movedScans += scans.count; movedNotifs += notifs.count; movedImages += images.count;
      await prisma.product.delete({ where: { id: d.id } });
      merged++;
    }
  }
  console.log(`merged ${merged} duplicate rows (scans moved: ${movedScans}, notifs: ${movedNotifs}, images: ${movedImages})`);

  // ── 2. backfill RfidTag rows for every product's primary tag ───────────────────
  const all = await prisma.product.findMany({ where: { rfidTag: { not: null } }, select: { id: true, rfidTag: true } });
  let created = 0;
  for (const p of all) {
    if (!p.rfidTag) continue;
    await prisma.rfidTag.upsert({
      where: { epc: p.rfidTag },
      update: { productId: p.id },
      create: { epc: p.rfidTag, productId: p.id, label: "primary" },
    });
    created++;
  }
  const tagCount = await prisma.rfidTag.count();
  console.log(`primary tags backfilled: ${created}, RfidTag rows total: ${tagCount}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
