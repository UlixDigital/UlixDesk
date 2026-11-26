/** Invoice draft lines reject a description longer than this on the next save. */
const INVOICE_LINE_TEXT_MAX = 200;

/**
 * Invoice lines have a name (`title`) and a secondary `detail`.
 * A quotation description is copied into `detail`, which prints under the name.
 * A date range replaces that detail on the invoice, so the description is
 * appended to the name instead, and any overflow stays in `detail`.
 */
export function invoiceFieldsFromQuotationLine(line: {
  title: string;
  detail: string;
  rangeStart?: Date | string | null;
  rangeEnd?: Date | string | null;
}) {
  const name = line.title.trim().slice(0, INVOICE_LINE_TEXT_MAX);
  const description = line.detail.trim();
  if (!description) return { title: name, detail: "" };
  const hasRange = Boolean(line.rangeStart && line.rangeEnd);
  if (!hasRange) return { title: name, detail: description.slice(0, INVOICE_LINE_TEXT_MAX) };
  const room = INVOICE_LINE_TEXT_MAX - name.length - 1;
  if (room >= description.length && room > 0) return { title: `${name}\n${description}`, detail: "" };
  if (room > 0) {
    return {
      title: `${name}\n${description.slice(0, room)}`,
      detail: description.slice(room).trim().slice(0, INVOICE_LINE_TEXT_MAX),
    };
  }
  return { title: name, detail: description.slice(0, INVOICE_LINE_TEXT_MAX) };
}

/** One cell for the per-quote CSV. Each item keeps its own line breaks. */
export function quotationLineDescriptions(lines: Array<{ title: string; detail: string }>) {
  return lines
    .map((line) => {
      const text = line.detail.trim();
      if (!text) return "";
      return `${line.title}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}
