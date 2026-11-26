import { isCurrencyCode } from "@/lib/currencies";
import {
  lineAmountFromCount,
  lineAmountFromMs,
  parseItemQuantity,
  parsePercentBps,
  parseQuantityInput,
} from "@/lib/invoice-money";
import { dateColumn } from "@/lib/invoice-form";
import { normalizeInvoiceText } from "@/lib/invoice-text";
import { parseRateInput } from "@/lib/money";
import { quotationCopy } from "@/lib/quotation-copy";
import type { QuantityKind } from "@/lib/invoice-form";
import { isRealCalendarDate } from "@/lib/time-zone";

const TEXT_MAX = 4000;
const TITLE_MAX = 200;
const LINE_DESCRIPTION_MAX = 2000;
const LABEL_MAX = 40;

export type QuotationLineWrite = {
  title: string;
  detail: string;
  quantityKind: QuantityKind;
  quantitySeconds: number;
  quantityMs: bigint;
  unitPriceMinor: number;
  amountMinor: number;
  rangeStart: string | null;
  rangeEnd: string | null;
};

export type QuotationDraftWrite = {
  issueDate: string;
  validUntil: string;
  notes: string;
  terms: string;
  taxEnabled: boolean;
  taxLabel: string;
  taxRateBps: number;
  lines: QuotationLineWrite[];
};

function dateOk(value: string) {
  if (!isRealCalendarDate(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

export function parseQuotationDraft(
  input: {
    issueDate: string;
    validUntil: string;
    notes: string;
    terms: string;
    taxEnabled: boolean;
    taxLabel: string;
    taxRate: string;
    lines: Array<{
      title: string;
      detail: string;
      quantity: string;
      unitPrice: string;
      quantityKind?: string;
      rangeStart?: string;
      rangeEnd?: string;
    }>;
  },
  currency: string,
): { ok: true; data: QuotationDraftWrite } | { ok: false; error: string } {
  if (!isCurrencyCode(currency)) return { ok: false, error: quotationCopy.priceInvalid };
  if (!dateOk(input.issueDate) || !dateOk(input.validUntil)) {
    return { ok: false, error: quotationCopy.dateInvalid };
  }
  if (input.validUntil < input.issueDate) return { ok: false, error: quotationCopy.validBeforeIssue };
  const notes = normalizeInvoiceText(input.notes).trim();
  const terms = normalizeInvoiceText(input.terms).trim();
  if (notes.length > TEXT_MAX || terms.length > TEXT_MAX) return { ok: false, error: quotationCopy.tooLong };
  if (input.lines.length > 100) return { ok: false, error: quotationCopy.tooLong };

  const taxLabel = input.taxLabel.trim() || "Tax";
  if (taxLabel.length > LABEL_MAX) return { ok: false, error: quotationCopy.tooLong };
  const tax = parsePercentBps(input.taxRate.trim() || "0");
  if (!tax.ok) return { ok: false, error: quotationCopy.percentInvalid };

  const lines: QuotationLineWrite[] = [];
  for (const line of input.lines) {
    const title = line.title.trim();
    if (!title) return { ok: false, error: quotationCopy.titleRequired };
    const detail = normalizeInvoiceText(line.detail).trim();
    if (title.length > TITLE_MAX || detail.length > LINE_DESCRIPTION_MAX) {
      return { ok: false, error: quotationCopy.tooLong };
    }
    const rangeStart = line.rangeStart?.trim() ?? "";
    const rangeEnd = line.rangeEnd?.trim() ?? "";
    if ((rangeStart && !rangeEnd) || (!rangeStart && rangeEnd)) {
      return { ok: false, error: quotationCopy.rangeIncomplete };
    }
    if (rangeStart || rangeEnd) {
      if (!dateOk(rangeStart) || !dateOk(rangeEnd)) return { ok: false, error: quotationCopy.dateInvalid };
      if (rangeEnd < rangeStart) return { ok: false, error: quotationCopy.rangeOrder };
    }
    const quantityKind: QuantityKind = line.quantityKind === "hours" ? "hours" : "item";
    const priceRaw = line.unitPrice.trim();
    if (priceRaw.startsWith("-") || priceRaw.startsWith("−")) {
      return { ok: false, error: quotationCopy.priceNonNegative };
    }
    const price = parseRateInput(priceRaw || "0", currency);
    if (!price.ok) return { ok: false, error: quotationCopy.priceInvalid };
    let quantitySeconds = 0;
    let quantityMs = BigInt(0);
    let amountMinor = 0;
    try {
      if (quantityKind === "item") {
        const quantity = parseItemQuantity(line.quantity);
        if (!quantity.ok) return { ok: false, error: quotationCopy.itemQuantityInvalid };
        quantityMs = quantity.scaled;
        amountMinor = lineAmountFromCount(price.amountMinor, quantityMs);
      } else {
        const quantity = parseQuantityInput(line.quantity);
        if (!quantity.ok) return { ok: false, error: quotationCopy.quantityInvalid };
        quantitySeconds = quantity.seconds;
        quantityMs = quantity.ms;
        amountMinor = lineAmountFromMs(price.amountMinor, quantityMs);
      }
    } catch {
      return { ok: false, error: quotationCopy.amountTooLarge };
    }
    lines.push({
      title,
      detail,
      quantityKind,
      quantitySeconds,
      quantityMs,
      unitPriceMinor: price.amountMinor,
      amountMinor,
      rangeStart: rangeStart || null,
      rangeEnd: rangeEnd || null,
    });
  }

  return {
    ok: true,
    data: {
      issueDate: input.issueDate,
      validUntil: input.validUntil,
      notes,
      terms,
      taxEnabled: input.taxEnabled,
      taxLabel,
      taxRateBps: tax.bps,
      lines,
    },
  };
}

export function parseQuotationFromForm(formData: FormData, currency: string) {
  const titles = formData.getAll("lineTitle").map(String);
  const details = formData.getAll("lineDetail").map(String);
  const quantities = formData.getAll("lineQuantity").map(String);
  const kinds = formData.getAll("lineQuantityKind").map(String);
  const prices = formData.getAll("lineUnitPrice").map(String);
  const rangeStarts = formData.getAll("lineRangeStart").map(String);
  const rangeEnds = formData.getAll("lineRangeEnd").map(String);
  const count = Math.max(titles.length, quantities.length, prices.length, rangeStarts.length);
  const lines = Array.from({ length: count }, (_, index) => ({
    title: titles[index] ?? "",
    detail: details[index] ?? "",
    quantity: quantities[index] ?? "",
    quantityKind: kinds[index] ?? "",
    unitPrice: prices[index] ?? "",
    rangeStart: rangeStarts[index] ?? "",
    rangeEnd: rangeEnds[index] ?? "",
  })).filter(
    (line) =>
      line.title.trim() ||
      line.detail.trim() ||
      line.quantity.trim() ||
      line.unitPrice.trim() ||
      line.rangeStart.trim() ||
      line.rangeEnd.trim(),
  );
  return parseQuotationDraft(
    {
      issueDate: String(formData.get("issueDate") ?? ""),
      validUntil: String(formData.get("validUntil") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      terms: String(formData.get("terms") ?? ""),
      taxEnabled: formData.get("taxEnabled") === "on",
      taxLabel: String(formData.get("taxLabel") ?? ""),
      taxRate: String(formData.get("taxRate") ?? ""),
      lines,
    },
    currency,
  );
}

export function quotationDateColumn(date: string) {
  return dateColumn(date);
}
