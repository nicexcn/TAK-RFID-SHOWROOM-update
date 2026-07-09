import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/permissions";
import { canAccessPath } from "@/lib/roles";

// #4 Report: product activity over a period (Daily/Weekly/Monthly/Yearly), searchable by
// customer code / Project / Sale. Returns the summary + "all scanned" and "taken home" lists
// (image1) plus brand/category interest breakdowns.

type Period = "daily" | "weekly" | "monthly" | "yearly";
type ProdLite = { id: string; name: string; brand: string | null; category: string | null; materialType: string | null; productCode: string | null };

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Bangkok (+07:00, no DST) — the showroom's local day

function windowFor(period: Period, now: Date): { from: Date; to: Date; label: string } {
  // Compute boundaries on the BANGKOK calendar, not the server's UTC (Vercel runs UTC): shift +7h and
  // read Bangkok wall-clock via UTC getters, take the period start, then shift back to a real UTC instant.
  const bkk = new Date(now.getTime() + TZ_OFFSET_MS);
  const y = bkk.getUTCFullYear(), m = bkk.getUTCMonth(), d = bkk.getUTCDate();
  let startBkk: number, label: string;
  if (period === "daily") { startBkk = Date.UTC(y, m, d); label = "Today"; }
  else if (period === "weekly") { startBkk = Date.UTC(y, m, d) - 6 * 86400000; label = "Last 7 days"; }
  else if (period === "yearly") { startBkk = Date.UTC(y, 0, 1); label = `Year ${y}`; }
  else { startBkk = Date.UTC(y, m, 1); label = "This month"; } // monthly (default)
  return { from: new Date(startBkk - TZ_OFFSET_MS), to: now, label };
}

const tally = (arr: (string | null | undefined)[]) => {
  const m = new Map<string, number>();
  for (const v of arr) { const k = (v || "").trim(); if (!k) continue; m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
};

export async function GET(req: NextRequest) {
  try {
    // #6: reports are management-level — the basic/prep roles can't read them, even via direct API.
    const user = getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canAccessPath(user.role, "/admin/reports")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const url = new URL(req.url);
    const periodParam = url.searchParams.get("period") || "monthly";
    const period: Period = (["daily", "weekly", "monthly", "yearly"] as const).includes(periodParam as Period) ? (periodParam as Period) : "monthly";
    const q = (url.searchParams.get("q") || "").trim();
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const now = new Date();
    let from: Date, to: Date, label: string;
    if (fromParam && toParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) && /^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
      // Custom range, resolved on the Bangkok calendar (same convention as windowFor): from-day 00:00
      // to to-day 23:59:59 Bangkok, expressed as UTC instants.
      const [fy, fm, fd] = fromParam.split("-").map(Number);
      const [ty, tm, td] = toParam.split("-").map(Number);
      from = new Date(Date.UTC(fy, fm - 1, fd) - TZ_OFFSET_MS);
      to = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999) - TZ_OFFSET_MS);
      label = "Custom range";
    } else {
      ({ from, to, label } = windowFor(period, now));
    }

    // Resolve the search term → matching customers (by code / project / sale / company / name).
    // Sessions link to customers via customerId AND customerCode, so collect both to filter scans.
    let matchIds: Set<string> | null = null;
    let matchCodes: Set<string> | null = null;
    const qLower = q.toLowerCase();
    if (q) {
      const custs = await prisma.customer.findMany({
        where: {
          OR: [
            { customerCode: { startsWith: q, mode: "insensitive" } }, // codes are prefixed ids → prefix match (no "001"→C0010 bleed)
            { project: { contains: q, mode: "insensitive" } },
            { salesPerson: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { fullName: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, customerCode: true },
      });
      matchIds = new Set(custs.map((c) => c.id));
      matchCodes = new Set(custs.map((c) => c.customerCode.toLowerCase())); // case-insensitive membership
    }

    const scans = await prisma.scan.findMany({
      where: { scannedAt: { gte: from, lte: to } },
      select: {
        id: true, takeawayQty: true, scannedAt: true,
        product: { select: { id: true, name: true, brand: true, category: true, materialType: true, productCode: true } },
        session: { select: { id: true, customerCode: true, customerId: true } },
      },
    });

    const filtered = q
      ? scans.filter((s) => {
          if (s.session.customerId && matchIds!.has(s.session.customerId)) return true; // registered customer
          const code = (s.session.customerCode || "").toLowerCase();
          if (matchCodes!.has(code)) return true;                          // registered, matched via code
          if (!s.session.customerId && code.includes(qLower)) return true; // walk-in ad-hoc code (substring)
          return false;
        })
      : scans;

    // Per-product aggregation: scan count + taken-home quantity.
    const prodMap = new Map<string, { product: ProdLite; scanCount: number; takenQty: number }>();
    for (const s of filtered) {
      if (!s.product) continue;
      const e = prodMap.get(s.product.id) || { product: s.product, scanCount: 0, takenQty: 0 };
      e.scanCount += 1;
      e.takenQty += s.takeawayQty || 0;
      prodMap.set(s.product.id, e);
    }
    const scannedProducts = [...prodMap.values()].sort((a, b) => b.scanCount - a.scanCount || b.takenQty - a.takenQty);
    const takenHomeProducts = scannedProducts.filter((p) => p.takenQty > 0).sort((a, b) => b.takenQty - a.takenQty);

    const summary = {
      visits: new Set(filtered.map((s) => s.session.id)).size,
      // Distinct real customers by id; walk-ins (no id) fall back to their code. Blanks ignored.
      customers: new Set(filtered.map((s) => s.session.customerId ?? (s.session.customerCode || null)).filter(Boolean)).size,
      totalScans: filtered.length,
      totalTaken: filtered.reduce((sum, s) => sum + (s.takeawayQty || 0), 0),
      uniqueProducts: prodMap.size,
    };

    // #11: ERP stock-cut export — per-takeaway line items (only when detail=takeaways is requested,
    // to keep the normal report payload lean). One row per taken-home line, enriched with customer.
    let takeaways: { date: string; customerCode: string; customer: string; company: string; productCode: string; productName: string; brand: string; category: string; qty: number; sale: string; project: string }[] | undefined;
    if (url.searchParams.get("detail") === "takeaways") {
      const takeScans = filtered.filter((s) => (s.takeawayQty || 0) > 0);
      const custIds = [...new Set(takeScans.map((s) => s.session.customerId).filter(Boolean) as string[])];
      const custs = custIds.length
        ? await prisma.customer.findMany({ where: { id: { in: custIds } }, select: { id: true, fullName: true, company: true, salesPerson: true, project: true } })
        : [];
      const byId = new Map(custs.map((c) => [c.id, c]));
      takeaways = takeScans.map((s) => {
        const c = s.session.customerId ? byId.get(s.session.customerId) : undefined;
        // Bangkok calendar day (YYYY-MM-DD), matching the report windows — the ERP consumes this per-day.
        const day = new Date(s.scannedAt.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
        return {
          date: day, customerCode: s.session.customerCode,
          customer: c?.fullName || s.session.customerCode, company: c?.company || "",
          productCode: s.product?.productCode || "", productName: s.product?.name || "",
          brand: s.product?.brand || "", category: s.product?.category || "",
          qty: s.takeawayQty, sale: c?.salesPerson || "", project: c?.project || "",
        };
      }).sort((a, b) => a.date.localeCompare(b.date));
    }

    return NextResponse.json({
      period: { from, to, label, key: period },
      summary,
      scannedProducts,
      takenHomeProducts,
      byBrand: tally(filtered.map((s) => s.product?.brand)),
      byCategory: tally(filtered.map((s) => s.product?.category)),
      takeaways,
    });
  } catch (error) {
    console.error("REPORTS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to build report" }, { status: 500 });
  }
}
