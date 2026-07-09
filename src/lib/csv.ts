import Papa from "papaparse";

/** Serialize rows (array of arrays) to a CSV string. Callers still prepend a BOM ("﻿")
 *  for Excel/Thai. `escapeFormulae` is papaparse's built-in CSV-injection guard: a cell
 *  beginning with =,+,-,@,tab or CR is prefixed with an apostrophe so it can't execute
 *  when the file is opened in a spreadsheet (it escapes, then quotes, in the right order). */
export function toCsv(rows: unknown[][]): string {
  return Papa.unparse(rows, { newline: "\r\n", escapeFormulae: true });
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
