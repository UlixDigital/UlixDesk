/** `ULXQ` and 2100 print as `ULXQ2100`. There is no separator and no padding. */
export function formatQuotationNumber(prefix: string, value: number) {
  return `${prefix}${value}`;
}

export const QUOTATION_NUMBER_START = 2100;
