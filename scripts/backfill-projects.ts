/**
 * Phase 2 backfill (run once): migrate legacy single-project free text on Customer
 * into real Project rows, and link each historical Session to it. Also backfills
 * docNo on already-COMPLETE notification batches that predate server-side numbering.
 * Run: npx tsx scripts/backfill-projects.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1) Customer.project free text -> Project row (per customer), keep the text field as pointer.
  const custs = await prisma.customer.findMany({
    where: { project: { not: null, notIn: [""] } },
    select: { id: true, project: true, zone: true, salesPerson: true },
  });
  let created = 0;
  for (const c of custs) {
    const name = (c.project || "").trim();
    if (!name) continue;
    const existing = await prisma.project.findUnique({ where: { customerId_name: { customerId: c.id, name } } });
    const proj = existing ?? await prisma.project.create({
      data: { customerId: c.id, name, zone: c.zone, salesName: c.salesPerson },
    });
    if (!existing) created++;
    // Link this customer's sessions that have no project yet.
    const linked = await prisma.session.updateMany({ where: { customerId: c.id, projectId: null }, data: { projectId: proj.id } });
    console.log(`customer ${c.id}: project "${name}"${existing ? " (existing)" : " created"}, ${linked.count} session(s) linked`);
  }
  console.log(`projects created: ${created}`);

  // 2) Backfill docNo for COMPLETE batches that predate server-side numbering:
  //    group by (customerCode|bkkDay), reuse the client-era format N{YY}{MM}{seq} so
  //    historical documents stay consistent with the new scheme.
  const notifs = await prisma.notification.findMany({
    where: { status: "COMPLETE", docNo: null, customer: { isNot: null } },
    select: { id: true, sessionId: true, createdAt: true, customer: { select: { customerCode: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });
  const bkk = (d: Date) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
  const groups = new Map<string, typeof notifs>();
  for (const n of notifs) {
    const key = `${n.customer?.customerCode || n.customer?.fullName || "WALK-IN"}|${bkk(n.createdAt)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(n);
  }
  let numbered = 0;
  const monthly = new Map<string, number>();
  // Seed the monthly counter from existing docNos so we don't collide with future assigns.
  const existingDocs = await prisma.notification.findMany({ where: { docNo: { not: null } }, select: { docNo: true } });
  for (const d of existingDocs) {
    const m = /^N(\d{2})(\d{2})(\d{4})$/.exec(d.docNo as string);
    if (m) monthly.set(`${m[1]}${m[2]}`, Math.max(monthly.get(`${m[1]}${m[2]}`) || 0, parseInt(m[3], 10)));
  }
  const sorted = [...groups.entries()].sort((a, b) => a[1][0].createdAt.getTime() - b[1][0].createdAt.getTime());
  for (const [, items] of sorted) {
    const d = items[0].createdAt;
    const yy = String(d.getUTCFullYear()).slice(2);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const mkey = `${yy}${mm}`;
    const seq = (monthly.get(mkey) || 0) + 1;
    monthly.set(mkey, seq);
    const docNo = `N${yy}${mm}${String(seq).padStart(4, "0")}`;
    await prisma.notification.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { docNo } });
    numbered++;
    console.log(`batch ${docNo}: ${items.length} notif(s) (${items[0].customer?.customerCode})`);
  }
  console.log(`batches numbered: ${numbered}`);
}

main().finally(() => prisma.$disconnect());
