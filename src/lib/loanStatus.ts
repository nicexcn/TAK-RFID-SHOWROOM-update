// Borrow/return ("ยืม / คืน") status, derived from a Scan's takeaway + return fields.
// Takeaway IS the loan: takeawayQty items go out, returnedQty come back. Isomorphic —
// imported by both the API route and the track page, so status is computed identically
// on server and client.

export const BORROW_DAYS = 14; // default loan period; an explicit Scan.dueDate overrides it
export const DAY_MS = 24 * 60 * 60 * 1000;

export type LoanStatus = "OUT" | "OVERDUE" | "RETURNED";

export interface LoanScanLike {
  scannedAt: Date | string;
  takeawayQty: number;
  returnedQty: number;
  dueDate: Date | string | null;
}

/** Effective due date: an explicit override, else scannedAt + BORROW_DAYS. */
export function effectiveDueDate(scan: LoanScanLike): Date {
  if (scan.dueDate) return new Date(scan.dueDate);
  return new Date(new Date(scan.scannedAt).getTime() + BORROW_DAYS * DAY_MS);
}

/** How many items are still out (not yet returned). */
export function loanRemaining(scan: LoanScanLike): number {
  return Math.max(0, scan.takeawayQty - scan.returnedQty);
}

export function loanStatus(scan: LoanScanLike, now: Date = new Date()): LoanStatus {
  if (loanRemaining(scan) <= 0) return "RETURNED";
  return effectiveDueDate(scan).getTime() < now.getTime() ? "OVERDUE" : "OUT";
}

/** Whole days past the effective due date (0 if not overdue / fully returned). */
export function daysOverdue(scan: LoanScanLike, now: Date = new Date()): number {
  if (loanRemaining(scan) <= 0) return 0;
  const diff = now.getTime() - effectiveDueDate(scan).getTime();
  return diff <= 0 ? 0 : Math.floor(diff / DAY_MS);
}
