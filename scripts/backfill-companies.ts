// One-time backfill (update-tak 13/9 [16]): create a Company row per distinct
// `company` string on Customer, and set `companyId` on matching customers.
// Idempotent: if a Company with the same name already exists, reuses it.
// Run: npx tsx scripts/backfill-companies.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // 1. Collect all distinct non-empty company strings from Customer.
  const companies = await prisma.customer.findMany({
    where: { company: { not: "" } },
    select: { company: true },
    distinct: ["company"],
  });
  console.log(`Found ${companies.length} distinct company strings to backfill.`);

  let created = 0, linked = 0;
  for (const { company } of companies) {
    // 2. Upsert a Company row (by unique name).
    const c = await prisma.company.upsert({
      where: { name: company },
      update: {},
      create: { name: company },
    });
    created++;

    // 3. Set companyId on all customers with this company string that don't have one yet.
    const r = await prisma.customer.updateMany({
      where: { company, companyId: null },
      data: { companyId: c.id },
    });
    linked += r.count;
  }
  console.log(`Done: ${created} companies upserted, ${linked} customers linked.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
