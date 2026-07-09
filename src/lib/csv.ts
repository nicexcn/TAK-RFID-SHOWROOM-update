import Papa from "papaparse";

// CSV serialization via papaparse (RFC 4180 quoting) + a formula-injection guard: a value
// beginning with =,+,-,@,tab or CR could execute when the CSV is opened in a spreadsheet, so
// we prefix it with an apostrophe. papaparse.unparse does NOT do this, so we keep it here.
function guard(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/** Serialize rows (array of arrays) to a CSV string. Callers still prepend a BOM ("﻿")
 *  for Excel/Thai. Every cell is injection-guarded first, then papaparse handles the quoting. */
export function toCsv(rows: unknown[][]): string {
  return Papa.unparse(rows.map((r) => r.map(guard)), { newline: "\r\n" });
}

/** Parse a CSV string into row objects keyed by the (trimmed) header row. Handles quoted fields
 *  with embedded commas/newlines and escaped quotes — the reason we use papaparse over a naive split. */
export function parseCsv(text: string): Record<string, string>[] {
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return data;
}
