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

  it("keeps a hash line when settings are saved", () => {
    const bank = "# Account note\nBeneficiary Name: Ulix Digital";
    const parsed = parseInvoiceSettings({ ...settings, invoiceBankDetails: bank, invoiceNotes: "# keep this note" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.invoiceBankDetails).toBe(bank);
    expect(parsed.data.invoiceNotes).toBe("# keep this note");
  });

  it("accepts a plain-number quantity and an optional date range", () => {
    const parsed = parseDraftInvoice(
      {
        ...draft,
        lines: [
          {
            id: "",
            title: "Design",
            detail: "",
            quantity: "1.5",
            unitPrice: "40",
            rangeStart: "2026-10-01",
            rangeEnd: "2026-10-03",
          },
        ],
      },
      "USD",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.lines[0]).toMatchObject({
      quantityMs: 5_400_000n,
      quantitySeconds: 5400,
      amountMinor: 6000,
      rangeStart: "2026-10-01",
      rangeEnd: "2026-10-03",
    });
    expect(
      parseDraftInvoice(
        {
          ...draft,
          lines: [{ id: "", title: "Design", detail: "", quantity: "1.5", unitPrice: "40", rangeStart: "2026-10-03", rangeEnd: "" }],
        },
        "USD",
      ),
    ).toMatchObject({ ok: false, error: invoiceCopy.rangeIncomplete });
  });

  it("bills a new item as a count and keeps an hours line in H:MM:SS", () => {
    const item = parseDraftInvoice(
      {
        ...draft,
        lines: [{ id: "", title: "Website design", detail: "", quantity: "1", unitPrice: "500", quantityKind: "item" }],
      },
      "USD",
    );
    expect(item.ok).toBe(true);
    if (!item.ok) return;
    expect(item.data.lines[0]).toMatchObject({
      quantityKind: "item",
      quantityMs: 100_000n,
      quantitySeconds: 0,
      amountMinor: 50_000,
    });
    const hours = parseDraftInvoice(draft, "USD");
    expect(hours.ok).toBe(true);
    if (!hours.ok) return;
    expect(hours.data.lines[0]?.quantityKind).toBe("hours");
    expect(hours.data.lines[0]?.quantityMs).toBe(3_600_000n);
  });

  it("rejects a negative price, a foreign-looking discount, and an over-large discount", () => {
    expect(parseDraftInvoice({ ...draft, lines: [{ ...draft.lines[0]!, unitPrice: "-5" }] }, "USD")).toEqual({
      ok: false,
      error: invoiceCopy.priceNonNegative,
    });
    expect(parseDraftInvoice({ ...draft, discountKind: "amount", discountValue: "11" }, "USD")).toEqual({
      ok: false,
      error: invoiceCopy.discountExceeds,
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
