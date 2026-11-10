/**
 * TAK Master File import (NimitrLOG_MASTER_FILE_..._05.11.2026.xlsx).
 *
 * Source data: scripts/data/master-file-2026-11-05.json (parsed from the xlsx; the sheet has
 * no embedded images — image columns are filenames only, so images are linked later when the
 * files arrive).
 *
 * Behaviour (additive — never deletes or archives):
 *  - Upserts by productCode (the no-space "Product code (NLog)").
 *  - Falls back to the product that owns the row's first RFID chip (physical identity), so a
 *    re-coded sheet updates the existing product instead of duplicating it.
 *  - Rows whose code is "N/A" (7 items) get productCode=null and match by brand+name.
 *  - Item code (with space) → Product.itemCode — the ERP export reads it.
 *  - Takeaway Limit → Product.takeawayLimit (the sheet's column is currently empty;
 *    re-running after TAK fills it applies the numbers).
 *  - RFID TAG 01/02 → RfidTag rows, real EPCs only (E280…). Status texts are skipped; a chip
 *    already bound to another product is left alone and reported.
 *
 * Batched: ~15 round-trips instead of ~5,000, so it runs in seconds against the pooler.
 * Idempotent. Run against each database:
 *   npx tsx scripts/import-master-file.ts            (Cloud, local .env)
 *   node scripts/import-master-file.ts               (on-prem, Node 24 TS stripping)
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

type Row = {
  no: number | null;
  brand: string | null;
  materialType: string | null;
  category: string | null;
  range: string | null;
  productCode: string | null;
  itemCode: string | null;
  name: string;
  size: string | null;
  thickness: string | null;
  takeawayLimit: number | null;
  remark: string | null;
  colour: string | null;
  finish: string | null;
  typeSpecies: string | null;
  edgeband: string | null;
  displayWall: string | null;
  tags: string[];
};

type ProductFields = Omit<Row, "no" | "tags">;

const FIELD_KEYS: (keyof ProductFields)[] = [
  "productCode", "brand", "materialType", "category", "range", "itemCode", "name", "size",
  "thickness", "takeawayLimit", "remark", "colour", "finish", "typeSpecies", "edgeband", "displayWall",
];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const file = join(process.cwd(), "scripts", "data", "master-file-2026-11-05.json");
  const rows = (JSON.parse(readFileSync(file, "utf8")) as { products: Row[] }).products;

  // ── Snapshot the DB in a handful of queries ────────────────────────────────
  const existing = await prisma.product.findMany({
    select: {
      id: true, productCode: true, rfidTag: true, name: true, brand: true,
      materialType: true, category: true, range: true, itemCode: true, size: true,
      thickness: true, takeawayLimit: true, remark: true, colour: true, finish: true,
      typeSpecies: true, edgeband: true, displayWall: true,
    },
  });
  const byCode = new Map<string, (typeof existing)[number]>();
  for (const p of existing) if (p.productCode) byCode.set(p.productCode, p);
  const byId = new Map(existing.map((p) => [p.id, p]));

  const allTags = await prisma.rfidTag.findMany({ select: { epc: true, productId: true } });
  const tagOwner = new Map(allTags.map((t) => [t.epc, t.productId]));
  // legacy primary column owners (rows predating the RfidTag backfill)
  for (const p of existing) if (p.rfidTag) tagOwner.set(p.rfidTag, p.id);

  const stats = { created: 0, updated: 0, unchanged: 0, noCode: 0, tagsAdded: 0, tagConflicts: 0 };
  const conflicts: string[] = [];
  const toCreate: ProductFields[] = [];
  const createRows: Row[] = []; // parallel to toCreate
  const updates: { id: string; fields: ProductFields }[] = [];
  const matched: { row: Row; productId: string }[] = []; // existing products, already updated
  const claimed = new Set<string>(); // pre-existing products already matched by an earlier row

  // ── Decide create vs update for every row (pure in-memory) ─────────────────
  for (const row of rows) {
    const fields: ProductFields = {
      productCode: row.productCode, brand: row.brand, materialType: row.materialType,
      category: row.category, range: row.range, itemCode: row.itemCode, name: row.name,
      size: row.size, thickness: row.thickness, takeawayLimit: row.takeawayLimit,
      remark: row.remark, colour: row.colour, finish: row.finish,
      typeSpecies: row.typeSpecies, edgeband: row.edgeband, displayWall: row.displayWall,
    };

    let target = row.productCode ? byCode.get(row.productCode) : undefined;
    // A chip is the physical identity: if the sheet re-codes an item that already existed
    // before this import, reuse that row instead of creating a duplicate. Only pre-existing
    // products qualify (never one created by another row in this same run), and a product
    // can be claimed at most once — the sheet contains EPCs repeated across many rows.
    if (!target && row.tags.length) {
      const ownerId = tagOwner.get(row.tags[0]);
      if (ownerId && byId.has(ownerId) && !claimed.has(ownerId)) {
        target = byId.get(ownerId);
        claimed.add(ownerId);
      }
    }
    if (!target && !row.productCode) {
      target = existing.find((p) => p.name === row.name && (p.brand ?? null) === (row.brand ?? null));
      stats.noCode++;
    }
    if (target) claimed.add(target.id);

    if (target) {
      const changed = FIELD_KEYS.some((k) => (target as Record<string, unknown>)[k] !== fields[k]);
      if (changed) {
        updates.push({ id: target.id, fields });
        Object.assign(target, fields); // keep the snapshot current for later rows
        stats.updated++;
      } else stats.unchanged++;
      matched.push({ row, productId: target.id });
    } else {
      toCreate.push(fields);
      createRows.push(row);
      stats.created++;
    }
  }

  // ── Apply updates (few) and create new products in bulk ────────────────────
  for (const u of updates) await prisma.product.update({ where: { id: u.id }, data: u.fields });
  for (const part of chunk(toCreate, 200)) await prisma.product.createMany({ data: part });

  // ── Resolve IDs for the new products ───────────────────────────────────────
  const newCodes = toCreate.map((c) => c.productCode).filter(Boolean) as string[];
  const created = await prisma.product.findMany({
    where: { productCode: { in: newCodes } },
    select: { id: true, productCode: true, rfidTag: true },
  });
  const newIdByCode = new Map(created.map((c) => [c.productCode!, c.id]));
  const newIdByKey = new Map<string, string>(); // for the 7 N/A rows: brand|name
  for (const row of createRows) {
    if (row.productCode) continue;
    const p = await prisma.product.findFirst({ where: { name: row.name, brand: row.brand }, select: { id: true } });
    if (p) newIdByKey.set(`${row.brand ?? ""}|${row.name}`, p.id);
  }

  // ── Desired chips for every row (matched + created) ────────────────────────
  const rowProductId = (row: Row): string | undefined =>
    row.productCode ? newIdByCode.get(row.productCode) : newIdByKey.get(`${row.brand ?? ""}|${row.name}`);

  const tagCreates: { epc: string; productId: string }[] = [];
  const primary: { id: string; epc: string }[] = [];
  const processedEpc = new Set<string>();

  const processTags = (row: Row, productId: string, hasPrimaryTag: boolean) => {
    for (const epc of row.tags) {
      if (processedEpc.has(epc)) continue;
      const owner = tagOwner.get(epc);
      if (owner && owner !== productId) {
        stats.tagConflicts++;
        if (conflicts.length < 20) conflicts.push(`${epc} → ${row.productCode ?? row.name}`);
        continue;
      }
      if (!owner) {
        tagCreates.push({ epc, productId });
        tagOwner.set(epc, productId); // reserve
        processedEpc.add(epc);
        stats.tagsAdded++;
      }
    }
    if (!hasPrimaryTag && row.tags.length && tagOwner.get(row.tags[0]) === productId) {
      primary.push({ id: productId, epc: row.tags[0] });
    }
  };

  for (const m of matched) processTags(m.row, m.productId, !!byId.get(m.productId)?.rfidTag);
  for (const row of createRows) {
    const productId = rowProductId(row);
    if (productId) processTags(row, productId, false);
  }

  for (const part of chunk(tagCreates, 500)) {
    await prisma.rfidTag.createMany({ data: part, skipDuplicates: true });
  }

  // ── Denormalized primary tag (unique column) — one bulk UPDATE ─────────────
  if (primary.length) {
    for (const part of chunk(primary, 200)) {
      const values = part.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(",");
      const params = part.flatMap((p) => [p.id, p.epc]);
      await prisma.$executeRawUnsafe(
        `UPDATE "Product" p SET "rfidTag" = v.epc
         FROM (VALUES ${values}) AS v(id, epc)
         WHERE p.id = v.id AND p."rfidTag" IS NULL`,
        ...params,
      );
    }
  }

  const total = await prisma.product.count();
  const tags = await prisma.rfidTag.count();
  console.log(
    `Master File rows ${rows.length}: created ${stats.created}, updated ${stats.updated}, unchanged ${stats.unchanged}, ` +
      `no-code ${stats.noCode}, tags added ${stats.tagsAdded}, tag conflicts ${stats.tagConflicts}. ` +
      `DB now: ${total} products, ${tags} tags.`,
  );
  if (conflicts.length) console.log("tag conflicts (left untouched):\n" + conflicts.join("\n"));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());