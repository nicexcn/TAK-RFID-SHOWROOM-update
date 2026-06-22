import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Record a return (or adjust a loan) on a single takeaway/Scan.
//   PATCH /api/loans/:scanId
//   body { returnAll: true }            -> mark every remaining item returned
//        { returnedQty: number }        -> set the returned count (clamped 0..takeawayQty)
//        { dueDate: string | null }     -> override / clear the due date
// returnedAt is kept in sync: set when the loan becomes fully returned, cleared otherwise.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ scanId: string }> }) {
  try {
    const { scanId } = await params;
    const body = await req.json().catch(() => ({})) as { returnAll?: boolean; returnedQty?: number; dueDate?: string | null };

    const scan = await prisma.scan.findUnique({ where: { id: scanId }, select: { takeawayQty: true, returnedAt: true } });
    if (!scan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });

    const data: { returnedQty?: number; returnedAt?: Date | null; dueDate?: Date | null } = {};

    if (body.returnAll) {
      data.returnedQty = scan.takeawayQty;
      data.returnedAt = new Date();
    } else if (typeof body.returnedQty === "number" && Number.isFinite(body.returnedQty)) {
      const q = Math.max(0, Math.min(scan.takeawayQty, Math.floor(body.returnedQty)));
      data.returnedQty = q;
      data.returnedAt = q >= scan.takeawayQty ? (scan.returnedAt ?? new Date()) : null;
    }

    if ("dueDate" in body) {
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await prisma.scan.update({
      where: { id: scanId },
      data,
      select: { id: true, takeawayQty: true, returnedQty: true, returnedAt: true, dueDate: true, scannedAt: true },
    });
    return NextResponse.json({ ok: true, scan: updated });
  } catch (error) {
    console.error("LOAN PATCH ERROR:", error);
    return NextResponse.json({ error: "Failed to update loan" }, { status: 500 });
  }
}
