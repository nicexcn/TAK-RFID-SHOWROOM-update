/**
 * Feedback round 3 (15/9): "Home connect" / "home connect" / "HOME CONNECT" are one company.
 * One-time merge of case-variant Company rows + relink of customers:
 *   1. Group Company rows by lower(name); for each group with >1 row, keep the row with the
 *      most customers (tie → earliest createdAt) as canonical.
 *   2. Repoint every customer of the losing rows to the canonical company and rewrite their
 *      denormalized `company` string to the canonical name.
 *   3. Delete the losing Company rows.
 *   4. Sweep: any customer whose `company` string case-insensitively matches a Company but
 *      isn't linked (companyId null or pointing elsewhere) gets relinked + normalized.
 *
 * Idempotent — a second run finds nothing to merge. Run with tsx after `db push`:
 *   npx tsx scripts/merge-company-case-dupes.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── 1-3: merge case-variant Company rows ─────────────────────────────────────────
  const companies = await prisma.company.findMany({
    include: { _count: { select: { customers: true } } },
    orderBy: { createdAt: "asc" },
  });
  const byLower = new Map<string, typeof companies>();
  for (const c of companies) {
    const key = c.name.trim().toLowerCase();
    if (!byLower.has(key)) byLower.set(key, []);
    byLower.get(key)!.push(c);
  }

  let mergedRows = 0;
  let repointed = 0;
  for (const group of byLower.values()) {
    if (group.length < 2) continue;
    // canonical = most customers, tie → earliest createdAt (already sorted asc)
    const canonical = [...group].sort((a, b) => b._count.customers - a._count.customers)[0];
    const losers = group.filter((c) => c.id !== canonical.id);
    for (const loser of losers) {
      const r = await prisma.customer.updateMany({
        where: { companyId: loser.id },
        data: { companyId: canonical.id, company: canonical.name },
      });
      repointed += r.count;
      await prisma.company.delete({ where: { id: loser.id } });
      mergedRows++;
      console.log(`merged "${loser.name}" → "${canonical.name}" (${r.count} customers moved)`);
    }
  }

  // ── 4: relink unlinked/misspelled customer strings ───────────────────────────────
  // Re-read post-merge so the map reflects canonical rows only.
  const remaining = await prisma.company.findMany({ select: { id: true, name: true } });
  const byName = new Map(remaining.map((c) => [c.name.trim().toLowerCase(), c]));

  const unlinked = await prisma.customer.findMany({
    where: { company: { not: "" } },
    select: { id: true, company: true, companyId: true },
  });
  let relinked = 0;
  for (const cust of unlinked) {
    const target = byName.get(cust.company.trim().toLowerCase());
    if (target && target.id !== cust.companyId) {
      await prisma.customer.update({
        where: { id: cust.id },
        data: { companyId: target.id, company: target.name },
      });
      relinked++;
    }
  }

  console.log(`\nDone: ${mergedRows} duplicate company row(s) merged, ${repointed} customers repointed, ${relinked} customer string(s) relinked/normalized.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
