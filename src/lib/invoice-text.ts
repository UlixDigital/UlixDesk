/**
 * CRLF and a lone CR become LF before notes or bank details are stored or drawn.
 * The invoice PDF font has no carriage-return glyph, so a leftover CR prints as "?".
 */
export function normalizeInvoiceText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
