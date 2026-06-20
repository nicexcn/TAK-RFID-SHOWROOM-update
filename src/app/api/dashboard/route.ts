import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function getPeriodRange(period: string) {
  const now = new Date();
  const from = new Date();
  if (period === "daily") from.setHours(0, 0, 0, 0);
  else if (period === "weekly") from.setDate(now.getDate() - 7);
  else if (period === "monthly") from.setMonth(now.getMonth() - 1);
  else if (period === "annually") from.setFullYear(now.getFullYear() - 1);
  return { from, to: now };
}

// A custom from/to (YYYY-MM-DD) wins over the period preset; the 'to' day is included whole.
function getRange(searchParams: URLSearchParams) {
  const fromP = searchParams.get("from");
  const toP = searchParams.get("to");
  if (fromP && toP) {
    const from = new Date(fromP);
    const to = new Date(toP);
    to.setHours(23, 59, 59, 999);
    if (!isNaN(from.getTime()) && !isNaN(to.getTime())) return { from, to };
  }
  return getPeriodRange(searchParams.get("period") || "daily");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const { from, to } = getRange(searchParams);
  try {
    // These 7 reads are independent — run them in ONE parallel batch instead of
    // sequentially. On a cross-region DB each await is a full round-trip, so
    // 7 sequential awaits stacked ~7×latency; Promise.all collapses that to ~1×.
    const [
      totalCustomers,
      newCustomers,
      totalSessions,
      allCustomers,
      customersWithChannels,
      sessions12m,
      scans,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.session.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.customer.findMany({ select: { title: true } }),
      prisma.customer.findMany({ select: { knowChannel: true } }),
      prisma.session.findMany({
        where: { createdAt: { gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) } },
        select: { createdAt: true },
      }),
      // Scan stats respect the selected period (customer req #6: scan stats by time).
      prisma.scan.findMany({ where: { scannedAt: { gte: from, lte: to } }, select: { product: { select: { category: true, materialType: true, brand: true } } } }),
    ]);

    const titleMap: Record<string, number> = {};
    allCustomers.forEach((c) => { const t = c.title || "Other"; titleMap[t] = (titleMap[t] || 0) + 1; });
    const customersByTitle = Object.entries(titleMap).map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count);

    const channelMap: Record<string, number> = {};
    customersWithChannels.forEach((c) => { (c.knowChannel || []).forEach((ch) => { channelMap[ch] = (channelMap[ch] || 0) + 1; }); });
    const customersByChannel = Object.entries(channelMap).map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count);

    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    // Bucket by YEAR+month (not just month name) so the same month a year apart can't collide
    // (e.g. Jun 2025 vs Jun 2026), then emit a continuous, chronological last-12-months axis
    // (zero-filled) — correct for the line chart, which would otherwise draw misleading slopes
    // across missing months.
    const monthMap: Record<string, number> = {};
    sessions12m.forEach((s) => {
      const key = `${s.createdAt.getFullYear()}-${s.createdAt.getMonth()}`;
      monthMap[key] = (monthMap[key] || 0) + 1;
    });
    const now = new Date();
    const sessionsByMonth = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return {
        month: `${monthNames[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`,
        count: monthMap[`${d.getFullYear()}-${d.getMonth()}`] || 0,
      };
    });

    const catMap: Record<string, number> = {};
    const matMap: Record<string, number> = {};
    const brandMap: Record<string, number> = {};
    scans.forEach((s) => {
      const cat = s.product.category || "Unknown";
      const mat = s.product.materialType || "Unknown";
      const br = s.product.brand || "Unknown";
      catMap[cat] = (catMap[cat] || 0) + 1;
      matMap[mat] = (matMap[mat] || 0) + 1;
      brandMap[br] = (brandMap[br] || 0) + 1;
    });
    const toChart = (map: Record<string, number>) =>
      Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);

    return NextResponse.json({
      totalCustomers, newCustomers, totalSessions,
      customersByTitle, customersByChannel, sessionsByMonth,
      scansByCategory: toChart(catMap), scansByMaterial: toChart(matMap), scansByBrand: toChart(brandMap),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ totalCustomers: 0, newCustomers: 0, totalSessions: 0, customersByTitle: [], customersByChannel: [], sessionsByMonth: [], scansByCategory: [], scansByMaterial: [], scansByBrand: [] });
  }
}
