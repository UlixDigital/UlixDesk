import { isCurrencyCode } from "@/lib/currencies";
import type { InvoiceGrouping } from "@/lib/invoice-lines";
import { invoiceCopy } from "@/lib/invoice-copy";
import {
  lineAmountMinor,
  parseDurationInput,
  parsePercentBps,
  type DiscountKind,
} from "@/lib/invoice-money";
import { parseRateInput } from "@/lib/money";
import { hasVisibleCharacters } from "@/lib/saved-reports";
import { isRealCalendarDate } from "@/lib/time-zone";

export const MAX_INVOICE_NUMBER = 1_000_000_000;

export const INVOICE_GROUPINGS = ["period", "project", "member", "day"] as const;
export const INVOICE_STATUSES = ["draft", "open", "paid", "partially_paid", "void"] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const TEXT_MAX = 4000;
const TITLE_MAX = 200;
const PO_MAX = 80;
const NAME_MAX = 200;
const ADDRESS_MAX = 500;
const LABEL_MAX = 40;

export function isInvoiceGrouping(value: string): value is InvoiceGrouping {
  return (INVOICE_GROUPINGS as readonly string[]).includes(value);
}

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (INVOICE_STATUSES as readonly string[]).includes(value);
}

export function isLockedInvoiceStatus(status: string) {
  return status === "open" || status === "paid" || status === "partially_paid";
}

function dateOk(value: string) {
  if (!isRealCalendarDate(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

export function parseCreateInvoice(input: {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  grouping: string;
}) {
  if (!input.clientId.trim()) return { ok: false as const, error: invoiceCopy.clientRequired };
  if (!dateOk(input.periodStart) || !dateOk(input.periodEnd)) {
    return { ok: false as const, error: invoiceCopy.dateInvalid };
  }
  if (input.periodEnd < input.periodStart) {
    return { ok: false as const, error: invoiceCopy.dateOrder };
  }
  if (!isInvoiceGrouping(input.grouping)) {
    return { ok: false as const, error: invoiceCopy.groupingInvalid };
  }
  return {
    ok: true as const,
    data: {
      clientId: input.clientId.trim(),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      grouping: input.grouping,
    },
  };
}

export type InvoiceSettingsWrite = {
  companyName: string;
  companyAddress: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  invoiceNetTermsDays: number;
  invoiceNotes: string;
  invoiceBankDetails: string;
  invoiceTaxEnabled: boolean;
  invoiceTaxLabel: string;
  invoiceTaxRateBps: number;
};

export function parseInvoiceSettings(input: {
  companyName: string;
  companyAddress: string;
  invoicePrefix: string;
  nextInvoiceNumber: string;
  invoiceNetTermsDays: string;
  invoiceNotes: string;
  invoiceBankDetails: string;
  invoiceTaxEnabled: boolean;
  invoiceTaxLabel: string;
  invoiceTaxRate: string;
}): { ok: true; data: InvoiceSettingsWrite } | { ok: false; error: string } {
  const companyName = input.companyName.trim().replace(/\s+/g, " ");
  if (!hasVisibleCharacters(companyName)) {
    return { ok: false, error: invoiceCopy.companyRequired };
  }
  if (companyName.length > NAME_MAX) {
    return { ok: false, error: invoiceCopy.tooLong };
  }
  const companyAddress = input.companyAddress.trim();
  if (!companyAddress || companyAddress.length > ADDRESS_MAX) {
    return { ok: false, error: companyAddress ? invoiceCopy.tooLong : invoiceCopy.addressRequired };
  }
  const invoicePrefix = input.invoicePrefix.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,12}$/.test(invoicePrefix)) {
    return { ok: false, error: invoiceCopy.prefixInvalid };
  }
  if (!/^\d+$/.test(input.nextInvoiceNumber.trim())) {
    return { ok: false, error: invoiceCopy.numberInvalid };
  }
  const nextInvoiceNumber = Number(input.nextInvoiceNumber.trim());
  if (!Number.isSafeInteger(nextInvoiceNumber) || nextInvoiceNumber < 1 || nextInvoiceNumber > MAX_INVOICE_NUMBER) {
    return { ok: false, error: invoiceCopy.numberInvalid };
  }
  if (!/^\d+$/.test(input.invoiceNetTermsDays.trim())) {
    return { ok: false, error: invoiceCopy.termsInvalid };
  }
  const invoiceNetTermsDays = Number(input.invoiceNetTermsDays.trim());
  if (invoiceNetTermsDays > 365) return { ok: false, error: invoiceCopy.termsInvalid };
  if (input.invoiceNotes.length > TEXT_MAX || input.invoiceBankDetails.length > TEXT_MAX) {
    return { ok: false, error: invoiceCopy.tooLong };
  }
  const invoiceTaxLabel = input.invoiceTaxLabel.trim() || "Tax";
  if (invoiceTaxLabel.length > LABEL_MAX) return { ok: false, error: invoiceCopy.tooLong };
  const rate = parsePercentBps(input.invoiceTaxRate.trim() || "0");
  if (!rate.ok) return { ok: false, error: invoiceCopy.percentInvalid };
  return {
    ok: true,
    data: {
      companyName,
      companyAddress,
      invoicePrefix,
      nextInvoiceNumber,
      invoiceNetTermsDays,
      invoiceNotes: input.invoiceNotes.trim(),
      invoiceBankDetails: input.invoiceBankDetails.trim(),
      invoiceTaxEnabled: input.invoiceTaxEnabled,
      invoiceTaxLabel,
      invoiceTaxRateBps: rate.bps,
    },
  };
}

export type DraftLineWrite = {
  id: string | null;
  title: string;
  detail: string;
  quantitySeconds: number;
  unitPriceMinor: number;
  amountMinor: number;
};

export type DraftWrite = {
  issueDate: string;
  dueDate: string;
  poNumber: string | null;
  notes: string;
  bankDetails: string;
  discountKind: DiscountKind;
  discountAmountMinor: number;
  discountBps: number;
  taxEnabled: boolean;
  taxLabel: string;
  taxRateBps: number;
  lines: DraftLineWrite[];
};

export function parseDraftInvoice(
  input: {
    issueDate: string;
    dueDate: string;
    poNumber: string;
    notes: string;
    bankDetails: string;
    discountKind: string;
    discountValue: string;
    taxEnabled: boolean;
    taxLabel: string;
    taxRate: string;
    lines: Array<{ id: string; title: string; detail: string; quantity: string; unitPrice: string }>;
  },
  currency: string,
): { ok: true; data: DraftWrite } | { ok: false; error: string } {
  if (!isCurrencyCode(currency)) return { ok: false, error: invoiceCopy.priceInvalid };
  if (!dateOk(input.issueDate) || !dateOk(input.dueDate)) {
    return { ok: false, error: invoiceCopy.dateInvalid };
  }
  if (input.dueDate < input.issueDate) return { ok: false, error: invoiceCopy.dueBeforeIssue };
  const po = input.poNumber.trim();
  if (po.length > PO_MAX) return { ok: false, error: invoiceCopy.tooLong };
  if (input.notes.length > TEXT_MAX || input.bankDetails.length > TEXT_MAX) {
    return { ok: false, error: invoiceCopy.tooLong };
  }
  if (input.lines.length > 100) return { ok: false, error: invoiceCopy.tooLong };

  let discountKind: DiscountKind = "none";
  let discountAmountMinor = 0;
  let discountBps = 0;
  if (input.discountKind === "percent") {
    discountKind = "percent";
    const discountValue = input.discountValue.trim() || "0";
    if (isNegativeDiscount(discountValue)) return { ok: false, error: invoiceCopy.discountNegative };
    const parsed = parsePercentBps(discountValue);
    if (!parsed.ok) return { ok: false, error: invoiceCopy.percentInvalid };
    discountBps = parsed.bps;
  } else if (input.discountKind === "amount") {
    discountKind = "amount";
    const discountValue = input.discountValue.trim() || "0";
    if (isNegativeDiscount(discountValue)) return { ok: false, error: invoiceCopy.discountNegative };
    const parsed = parseRateInput(discountValue, currency);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    discountAmountMinor = parsed.amountMinor;
  } else if (input.discountKind !== "none") {
    return { ok: false, error: invoiceCopy.percentInvalid };
  }

  const taxLabel = input.taxLabel.trim() || "Tax";
  if (taxLabel.length > LABEL_MAX) return { ok: false, error: invoiceCopy.tooLong };
  const tax = parsePercentBps(input.taxRate.trim() || "0");
  if (!tax.ok) return { ok: false, error: invoiceCopy.percentInvalid };

  const lines: DraftLineWrite[] = [];
  for (const line of input.lines) {
    const title = line.title.trim();
    if (!title) return { ok: false, error: invoiceCopy.titleRequired };
    if (title.length > TITLE_MAX || line.detail.trim().length > TITLE_MAX) {
      return { ok: false, error: invoiceCopy.tooLong };
    }
    const quantity = parseDurationInput(line.quantity);
    if (!quantity.ok) return { ok: false, error: invoiceCopy.quantityInvalid };
    const price = parseRateInput(line.unitPrice.trim() || "0", currency);
    if (!price.ok) return { ok: false, error: price.error };
    let amountMinor = 0;
    try {
      amountMinor = lineAmountMinor(price.amountMinor, quantity.seconds);
    } catch {
      return { ok: false, error: invoiceCopy.amountTooLarge };
    }
    lines.push({
      id: line.id.trim() || null,
      title,
      detail: line.detail.trim(),
      quantitySeconds: quantity.seconds,
      unitPriceMinor: price.amountMinor,
      amountMinor,
    });
  }

  return {
    ok: true,
    data: {
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      poNumber: po || null,
      notes: input.notes.trim(),
      bankDetails: input.bankDetails.trim(),
      discountKind,
      discountAmountMinor,
      discountBps,
      taxEnabled: input.taxEnabled,
      taxLabel,
      taxRateBps: tax.bps,
      lines,
    },
  };
}

function isNegativeDiscount(value: string) {
  return value.startsWith("-") || value.startsWith("−");
}

export function civilDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function dateColumn(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}
