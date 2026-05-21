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
    const totalCustomers = await prisma.customer.count();
    const newCustomers = await prisma.customer.count({ where: { createdAt: { gte: from, lte: to } } });
    const totalSessions = await prisma.session.count({ where: { createdAt: { gte: from, lte: to } } });

    const allCustomers = await prisma.customer.findMany({ select: { title: true } });
    const titleMap: Record<string, number> = {};
    allCustomers.forEach((c) => { const t = c.title || "Other"; titleMap[t] = (titleMap[t] || 0) + 1; });
    const customersByTitle = Object.entries(titleMap).map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count);

    const customersWithChannels = await prisma.customer.findMany({ select: { knowChannel: true } });
    const channelMap: Record<string, number> = {};
    customersWithChannels.forEach((c) => { (c.knowChannel || []).forEach((ch) => { channelMap[ch] = (channelMap[ch] || 0) + 1; }); });
    const customersByChannel = Object.entries(channelMap).map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count);

    const sessions12m = await prisma.session.findMany({
      where: { createdAt: { gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) } },
      select: { createdAt: true },
    });
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const monthMap: Record<string, number> = {};
    sessions12m.forEach((s) => { const key = monthNames[s.createdAt.getMonth()]; monthMap[key] = (monthMap[key] || 0) + 1; });
    const sessionsByMonth = monthNames.filter((m) => monthMap[m]).map((m) => ({ month: m, count: monthMap[m] }));

    const scans = await prisma.scan.findMany({ select: { product: { select: { category: true, materialType: true, brand: true } } } });
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
