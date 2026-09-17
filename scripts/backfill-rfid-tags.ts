/**
 * 16/9 restructure: Product = one physical item, RfidTag = the tag table (many chips per item).
 * One-time backfill:
 *   1. MERGE duplicate door-panel rows — the TagNo import created one Product per EPC, so a
 *      panel with EPC1+EPC2 exists twice (same name/productCode/category "Door Panel").
 *      Keep the first row, move the duplicate's tag onto the survivor, delete the duplicate.
 *      (The duplicate rows carry no scans/images — they were just imported — but guard anyway.)
 *   2. Seed RfidTag from every remaining Product.rfidTag (label "primary").
 *
 * Idempotent — re-running finds nothing to merge and skips existing tag rows.
 *   npx tsx scripts/backfill-rfid-tags.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── 1. merge duplicate door-panel rows ────────────────────────────────────────────
  const panels = await prisma.product.findMany({
    where: { category: "Door Panel" },
    select: { id: true, name: true, productCode: true, rfidTag: true },
    orderBy: { createdAt: "asc" }, // keep the earliest row of each group
  });
  const byItem = new Map<string, typeof panels>();
  for (const p of panels) {
    const key = p.productCode || p.name;
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key)!.push(p);
  }

  let merged = 0, keptTags = 0;
  for (const group of byItem.values()) {
    if (group.length < 2) continue;
    const [keep, ...dupes] = group;
    for (const dupe of dupes) {
      const used = await prisma.scan.count({ where: { productId: dupe.id } });
      const notifs = await prisma.notification.count({ where: { productId: dupe.id } });
      const images = await prisma.productImage.count({ where: { productId: dupe.id } });
      if (used || notifs || images) {
        // The duplicate carries real history — do NOT delete; just leave both rows (each keeps
        // its own tag; both resolve independently, worst case the panel counts as 2 items).
        console.log(`skip merge ${dupe.productCode} (${dupe.id}): has history (${used} scans, ${notifs} notifs, ${images} images)`);
        continue;
      }
      // Move the duplicate's EPC onto the survivor as a second tag, then drop the empty row.
      if (dupe.rfidTag) {
        await prisma.rfidTag.create({
          data: { epc: dupe.rfidTag, label: "EPC2", productId: keep.id },
        }).catch(() => { /* EPC already in the tag table — nothing to do */ });
        keptTags++;
      }
      await prisma.product.delete({ where: { id: dupe.id } });
      merged++;
    }
  }
  console.log(`merged ${merged} duplicate door-panel row(s); ${keptTags} secondary tag(s) moved onto survivors`);

  // ── 2. seed RfidTag from every Product.rfidTag ────────────────────────────────────
  const all = await prisma.product.findMany({ where: { rfidTag: { not: null } }, select: { id: true, rfidTag: true } });
  let seeded = 0;
  for (const p of all) {
    if (!p.rfidTag) continue;
    try {
      await prisma.rfidTag.create({ data: { epc: p.rfidTag, label: "primary", productId: p.id } });
      seeded++;
    } catch { /* already seeded on a previous run */ }
  }
  console.log(`seeded ${seeded} primary tag row(s); RfidTag now holds ${await prisma.rfidTag.count()} rows`);

  const final = await prisma.product.count({ where: { category: "Door Panel" } });
  console.log(`door panels after merge: ${final}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
