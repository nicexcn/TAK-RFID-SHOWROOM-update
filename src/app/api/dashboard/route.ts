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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "daily";
  const { from, to } = getPeriodRange(period);
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
    const monthMap: Record<string, number> = {};
    sessions12m.forEach((s) => { const key = monthNames[s.createdAt.getMonth()]; monthMap[key] = (monthMap[key] || 0) + 1; });
    const sessionsByMonth = monthNames.filter((m) => monthMap[m]).map((m) => ({ month: m, count: monthMap[m] }));

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
