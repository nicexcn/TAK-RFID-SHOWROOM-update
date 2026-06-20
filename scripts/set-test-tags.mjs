// Re-tag the products with the real device's EPC format AAAA…1001 … AAAA…1020 so a real
// scan maps to a product; any other EPC is "unknown". Backs up old tags for revert.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";

const prisma = new PrismaClient();
const REVERT = process.argv.includes("--revert");
const BACKUP = "scripts/.tag-backup.json";

const epc = (n) => "AAAA" + String(1000 + n).padStart(20, "0"); // AAAA00000000000000001001 …

async function main() {
  if (REVERT) {
    const { readFileSync } = await import("node:fs");
    const rows = JSON.parse(readFileSync(BACKUP, "utf8"));
    for (const r of rows) await prisma.product.update({ where: { id: r.id }, data: { rfidTag: r.oldTag } });
    console.log(`reverted ${rows.length} products to their original tags.`);
    return;
  }

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, productCode: true, name: true, rfidTag: true },
  });
  console.log(`re-tagging ${products.length} products → AAAA…1001 .. AAAA…${String(1000 + products.length).slice(-4)}\n`);

  const backup = products.map((p) => ({ id: p.id, oldTag: p.rfidTag }));
  writeFileSync(BACKUP, JSON.stringify(backup, null, 2));

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const newTag = epc(i + 1);
    await prisma.product.update({ where: { id: p.id }, data: { rfidTag: newTag } });
    console.log(`  ${String(i + 1).padStart(2)}  ${(p.productCode || "—").padEnd(10)} ${p.name.slice(0, 28).padEnd(28)}  ${p.rfidTag.padEnd(10)} → ${newTag}`);
  }
  console.log(`\nbackup saved to ${BACKUP} (revert: node scripts/set-test-tags.mjs --revert)`);
  console.log(`unknown-tag test: send any EPC NOT in 1001..${1000 + products.length}, e.g. AAAA${String(9999).padStart(20, "0")}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
