// RFC 4180 CSV cell escaping + formula-injection guard. Use for any CSV export so
// values containing commas/quotes/newlines don't corrupt the file and a value like
// "=cmd()" can't execute when the CSV is opened in a spreadsheet.
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise formula injection
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export function toCsv(rows: unknown[][]): string {
  return rows.map(csvRow).join("\r\n");
}
