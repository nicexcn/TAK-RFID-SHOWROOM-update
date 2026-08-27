import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loanStatus, effectiveDueDate, loanRemaining, daysOverdue } from "@/lib/loanStatus";

// Borrow/return tracking. Every takeaway (Scan.takeawayQty > 0) is a loan; the return
// side lives on the same Scan (returnedQty / returnedAt / dueDate). The customer is
// derived via Session.customerId (Session has no customer relation, so names/phones are
// resolved in a second batched query, like /api/readers).
//   GET /api/loans?status=all|out|overdue|returned&q=<search>
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "all").toLowerCase();
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    // Configurable default loan period (AppSettings.borrowDays); per-loan Scan.dueDate overrides it.
    const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" }, select: { borrowDays: true } });
    const borrowDays = settings?.borrowDays && settings.borrowDays > 0 ? settings.borrowDays : undefined; // undefined → loanStatus uses BORROW_DAYS

    const scans = await prisma.scan.findMany({
      // image3: only must-return takeaways are loans. Keyed on the per-scan snapshot (Scan.isLoan),
      // NOT the live product flag, so flipping a product to give-away can't orphan outstanding loans.
      where: { takeawayQty: { gt: 0 }, isLoan: true },
      select: {
        id: true, scannedAt: true, takeawayQty: true, returnedQty: true, returnedAt: true, dueDate: true,
        product: { select: { id: true, name: true, productCode: true, imageUrl: true, brand: true, colour: true, size: true } },
        session: { select: { customerCode: true, customerId: true } },
        borrowerNote: true,
        borrowedAtOverride: true,
      },
      orderBy: { scannedAt: "desc" },
    });

    const ids = [...new Set(scans.map((s) => s.session.customerId).filter(Boolean) as string[])];
    const customers = ids.length
      ? await prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, company: true, phone: true } })
      : [];
    const custById = new Map(customers.map((c) => [c.id, c]));

    const now = new Date();
    const all = scans.map((s) => {
      const c = s.session.customerId ? custById.get(s.session.customerId) : undefined;
      return {
        scanId: s.id,
        customerId: s.session.customerId,
        customerCode: s.session.customerCode,
        customerName: c?.fullName || s.session.customerCode,
        customerCompany: c?.company || "",
        customerPhone: c?.phone || "",
        // Slide 32: manual borrower correction (shown instead of the record when set)
        borrowerNote: s.borrowerNote || "",
        borrowedAtOverride: !!s.borrowedAtOverride,
        product: s.product,
        borrowedQty: s.takeawayQty,
        returnedQty: s.returnedQty,
        remaining: loanRemaining(s),
        borrowedAt: s.borrowedAtOverride || s.scannedAt,
        dueDate: effectiveDueDate({ ...s, scannedAt: s.borrowedAtOverride || s.scannedAt }, borrowDays),
        dueOverridden: !!s.dueDate,
        returnedAt: s.returnedAt,
        status: loanStatus({ ...s, scannedAt: s.borrowedAtOverride || s.scannedAt }, now, borrowDays),
        daysOverdue: daysOverdue({ ...s, scannedAt: s.borrowedAtOverride || s.scannedAt }, now, borrowDays),
      };
    });

    // Tab counts always reflect the full set (search/filter never changes them).
    const counts = {
      all: all.length,
      outstanding: all.filter((l) => l.status !== "RETURNED").length,
      overdue: all.filter((l) => l.status === "OVERDUE").length,
      returned: all.filter((l) => l.status === "RETURNED").length,
    };

    let loans = all;
    if (status === "out" || status === "outstanding") loans = loans.filter((l) => l.status !== "RETURNED");
    else if (status === "overdue") loans = loans.filter((l) => l.status === "OVERDUE");
    else if (status === "returned") loans = loans.filter((l) => l.status === "RETURNED");

    if (q) {
      loans = loans.filter((l) =>
        [l.customerName, l.customerCode, l.customerCompany, l.customerPhone, l.product.name, l.product.productCode, l.product.brand]
          .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
    }

    const rank = (s: string) => (s === "OVERDUE" ? 0 : s === "OUT" ? 1 : 2);
    // Explicit column sort (from the table header) overrides the smart default below.
    const SORTABLE = new Set(["item", "customer", "borrowedAt", "dueDate", "status"]);
    const sortField = url.searchParams.get("sort") || "";
    const sortDir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
    if (SORTABLE.has(sortField)) {
      const val = (l: (typeof all)[number]): string | number => {
        switch (sortField) {
          case "item": return (l.product.name || "").toLowerCase();
          case "customer": return (l.customerName || "").toLowerCase();
          case "borrowedAt": return new Date(l.borrowedAt).getTime();
          case "dueDate": return new Date(l.dueDate).getTime();
          case "status": return rank(l.status);
          default: return 0;
        }
      };
      loans.sort((a, b) => {
        const av = val(a), bv = val(b);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
    } else {
      // Default: overdue first, then out, then returned. Within out/overdue by soonest due;
      // returned by most recent return.
      loans.sort((a, b) => {
        if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
        if (a.status === "RETURNED") return new Date(b.returnedAt || 0).getTime() - new Date(a.returnedAt || 0).getTime();
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    }

    // No ?page → return everything (back-compat). Otherwise paginate the computed list.
    const pageParam = url.searchParams.get("page");
    if (pageParam === null) return NextResponse.json({ loans, counts });
    const page = Math.max(1, parseInt(pageParam, 10) || 1);
    const limit = 12;
    const total = loans.length;
    const paged = loans.slice((page - 1) * limit, page * limit);
    return NextResponse.json({ loans: paged, counts, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("LOANS GET ERROR:", error);
    return NextResponse.json({ loans: [], counts: { all: 0, outstanding: 0, overdue: 0, returned: 0 } });
  }
}
