/** Cells that start with these characters are formulas in spreadsheet apps. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Prefix a formula-looking cell so a spreadsheet shows it as text. */
export function csvCell(value: string): string {
  let text = value;
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

/** RFC 4180 CSV. Every row ends with CRLF, including the last row. */
export function toCsv(rows: string[][]): string {
  return `${rows.map((row) => row.map((cell) => csvCell(cell)).join(",")).join("\r\n")}\r\n`;
}
