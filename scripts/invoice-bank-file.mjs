/**
 * Bank-detail files may start with `#` comments and blank lines.
 * Those are not part of the note printed on the invoice.
 * Blank lines between the remaining lines are kept.
 */
export function parseInvoiceBankFile(text) {
  const lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const kept = [];
  for (const line of lines) {
    if (line.trim().startsWith("#")) continue;
    kept.push(line);
  }
  let start = 0;
  let end = kept.length;
  while (start < end && kept[start].trim() === "") start += 1;
  while (end > start && kept[end - 1].trim() === "") end -= 1;
  return kept.slice(start, end).join("\n");
}
