import { describe, expect, it } from "vitest";
import { invoiceFieldsFromQuotationLine, quotationLineDescriptions } from "@/lib/quotation-lines";

describe("quotation line descriptions", () => {
  it("keeps a description under the invoice name when there is no date range", () => {
    expect(
      invoiceFieldsFromQuotationLine({
        title: "Weekly quotation",
        detail: "Homepage refresh\nand hosting",
      }),
    ).toEqual({ title: "Weekly quotation", detail: "Homepage refresh\nand hosting" });
  });

  it("appends a description to the invoice name when a date range would replace it", () => {
    expect(
      invoiceFieldsFromQuotationLine({
        title: "Weekly quotation",
        detail: "Homepage refresh",
        rangeStart: "2026-10-05",
        rangeEnd: "2026-10-11",
      }),
    ).toEqual({ title: "Weekly quotation\nHomepage refresh", detail: "" });
  });

  it("joins line descriptions for the per-quote CSV column", () => {
    expect(
      quotationLineDescriptions([
        { title: "Weekly quotation", detail: "First line\nSecond line" },
        { title: "Setup", detail: "" },
        { title: "Hosting", detail: "Monthly" },
      ]),
    ).toBe("Weekly quotation: First line\nSecond line\nHosting: Monthly");
  });
});
