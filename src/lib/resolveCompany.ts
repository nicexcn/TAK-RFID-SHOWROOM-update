import { prisma } from "@/lib/prisma";

// Feedback round 3 (15/9): "home connect" / "Home Connect" / "HOME CONNECT" are ONE company —
// spelling variants must not fork new Company rows. Resolve a typed company string to a Company
// row case-insensitively; reuse the row's canonical name (so the denormalized Customer.company
// string converges on one spelling) and create the row on first sight. companyId comes back
// linked so callers never have to trust the client's id.
export async function resolveCompany(raw: unknown): Promise<{ name: string; companyId: string | null }> {
  const name = String(raw ?? "").trim();
  if (!name) return { name: "", companyId: null };
  const existing = await prisma.company.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (existing) return { name: existing.name, companyId: existing.id };
  try {
    const created = await prisma.company.create({ data: { name }, select: { id: true, name: true } });
    return { name: created.name, companyId: created.id };
  } catch {
    // Lost a create race on the unique name — re-find and reuse the winner.
    const again = await prisma.company.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    return again ? { name: again.name, companyId: again.id } : { name, companyId: null };
  }
}
