/** `Q` and 1 print as `Q-0001`. Numbers past 9999 keep every digit. */
export function formatQuotationNumber(prefix: string, value: number) {
  return `${prefix}-${String(value).padStart(4, "0")}`;
}
