import { describe, expect, it } from "vitest";
import { invoiceCopy } from "@/lib/invoice-copy";
import { parseDraftInvoice, parseInvoiceSettings } from "@/lib/invoice-form";

const settings = {
  companyName: "Ulix Digital",
  companyAddress: "30 North Gould Street",
  invoicePrefix: "LE",
  nextInvoiceNumber: "1176",
  invoiceNetTermsDays: "7",
  invoiceNotes: "",
  invoiceBankDetails: "",
  invoiceTaxEnabled: false,
  invoiceTaxLabel: "Tax",
  invoiceTaxRate: "0",
};

const draft = {
  issueDate: "2026-10-12",
  dueDate: "2026-10-19",
  poNumber: "",
  notes: "",
  bankDetails: "",
  discountKind: "amount",
  discountValue: "0",
  taxEnabled: false,
  taxLabel: "Tax",
  taxRate: "0",
  lines: [{ id: "", title: "Custom", detail: "", quantity: "1:00:00", unitPrice: "10" }],
};

describe("invoice form errors", () => {
  it("rejects a company name with no visible characters", () => {
    expect(parseInvoiceSettings({ ...settings, companyName: "\u200B\u2800" }).ok).toBe(false);
    expect(parseInvoiceSettings({ ...settings, companyName: "   " })).toMatchObject({
      ok: false,
      error: invoiceCopy.companyRequired,
    });
    expect(parseInvoiceSettings(settings).ok).toBe(true);
  });

  it("states the maximum invoice number", () => {
    expect(parseInvoiceSettings({ ...settings, nextInvoiceNumber: "1000000001" })).toMatchObject({
      ok: false,
      error: invoiceCopy.numberInvalid,
    });
    expect(invoiceCopy.numberInvalid).toContain("1,000,000,000");
  });

  it("rejects a due date before the issue date", () => {
    expect(parseDraftInvoice({ ...draft, dueDate: "2026-10-11" }, "USD")).toEqual({
      ok: false,
      error: "Due date must be on or after the issue date.",
    });
  });

  it("rejects a negative discount with a clear message", () => {
    expect(parseDraftInvoice({ ...draft, discountKind: "amount", discountValue: "-5" }, "USD")).toEqual({
      ok: false,
      error: invoiceCopy.discountNegative,
    });
    expect(parseDraftInvoice({ ...draft, discountKind: "percent", discountValue: "-1" }, "USD")).toEqual({
      ok: false,
      error: invoiceCopy.discountNegative,
    });
  });
});
