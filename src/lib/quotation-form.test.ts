import { describe, expect, it } from "vitest";
import { invoiceTotals } from "@/lib/invoice-money";
import { parseQuotationDraft } from "@/lib/quotation-form";

describe("quotation totals and tax", () => {
  it("prices hours and items, then applies one tax rate to the subtotal", () => {
    const parsed = parseQuotationDraft(
      {
        issueDate: "2026-11-25",
        validUntil: "2026-12-09",
        notes: "Please review",
        terms: "Valid until the date shown",
        taxEnabled: true,
        taxLabel: "VAT",
        taxRate: "10",
        lines: [
          {
            title: "Weekly quotation",
            detail: "",
            quantity: "2",
            quantityKind: "hours",
            unitPrice: "25",
            rangeStart: "2026-11-16",
            rangeEnd: "2026-11-22",
          },
          {
            title: "Setup",
            detail: "",
            quantity: "1",
            quantityKind: "item",
            unitPrice: "100",
          },
        ],
      },
      "USD",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.lines[0]).toMatchObject({ quantitySeconds: 7200, amountMinor: 5000, quantityKind: "hours" });
    expect(parsed.data.lines[1]).toMatchObject({ amountMinor: 10000, quantityKind: "item" });
    expect(parsed.data.taxRateBps).toBe(1000);
    expect(
      invoiceTotals({
        lineAmounts: parsed.data.lines.map((line) => line.amountMinor),
        discountKind: "none",
        discountAmountMinor: 0,
        discountBps: 0,
        taxEnabled: parsed.data.taxEnabled,
        taxRateBps: parsed.data.taxRateBps,
      }),
    ).toEqual({ subtotalMinor: 15000, discountMinor: 0, taxMinor: 1500, totalMinor: 16500 });
  });

  it("refuses a valid-until date before the issue date", () => {
    const parsed = parseQuotationDraft(
      {
        issueDate: "2026-11-25",
        validUntil: "2026-11-24",
        notes: "",
        terms: "",
        taxEnabled: false,
        taxLabel: "Tax",
        taxRate: "0",
        lines: [],
      },
      "USD",
    );
    expect(parsed.ok).toBe(false);
  });
});
