// Single source of truth for date display. The app previously mixed `th-TH`
// (Buddhist era — 15/7/2569), `en-GB` (15/07/2026) and ISO across screens, so
// the same date looked different page to page. Standardise on Gregorian en-GB
// (day-first, 4-digit year) everywhere, including CSV exports.

const DATE = "en-GB";

/** "15/07/2026" — for tables, cards, CSV exports. Accepts a Date, ISO string, or timestamp. */
export function formatDate(input: string | number | Date | null | undefined): string {
  if (input === null || input === undefined || input === "") return "-";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(DATE, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** "15/07/2026, 14:30" — when the time matters (logs, notifications). */
export function formatDateTime(input: string | number | Date | null | undefined): string {
  if (input === null || input === undefined || input === "") return "-";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString(DATE, {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
