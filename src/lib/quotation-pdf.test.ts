import { describe, expect, it } from "vitest";
import { pdfTextPositions, renderInvoicePdf } from "@/lib/invoice-pdf";
import { toQuotationPdfInput } from "@/lib/quotation-document";

describe("quotation pdf", () => {
  it("mirrors the invoice page and leaves out payment rows and bank details", async () => {
    const trace: Array<{ text: string; x: number; y: number }> = [];
    const input = toQuotationPdfInput({
      companyName: "Ulix Digital",
      companyAddress: "30 North Gould Street, Sheridan, WY 82801",
      number: "Q-0001",
      clientName: "WSI Web Enhancers",
      clientAddress: "4801 Lang Ave NE Suite 110, Albuquerque, NM 87109",
      currency: "USD",
      issueDate: "2026-10-12",
      validUntil: "2026-10-26",
      notes: "Please review this quotation.",
      terms: "This quotation is valid until the date shown.",
      taxEnabled: true,
      taxLabel: "Tax",
      taxRateBps: 1000,
      subtotalMinor: 65925,
      taxMinor: 6593,
      totalMinor: 72518,
      lines: [
        {
          title: "Weekly quotation",
          detail: "",
          quantitySeconds: 26 * 3600 + 22 * 60 + 12,
          quantityMs: BigInt((26 * 3600 + 22 * 60 + 12) * 1000),
          quantityKind: "hours",
          rangeStart: "2026-10-05",
          rangeEnd: "2026-10-11",
          unitPriceMinor: 2500,
          amountMinor: 65925,
        },
      ],
    });
    const pdf = await renderInvoicePdf(input, { compress: false, trace });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1").includes("/Image")).toBe(true);
    const text = [...trace.map((item) => item.text), ...pdfTextPositions(pdf).map((item) => item.text)].join("\n");
    expect(text).toContain("Quotation Q-0001");
    expect(text).toContain("Valid until:");
    expect(text).toContain("Issue date:");
    expect(text).toContain("FROM");
    expect(text).toContain("TO");
    expect(text).toContain("Ulix Digital");
    expect(text).toContain("WSI Web Enhancers");
    expect(text).toContain("Weekly quotation");
    expect(text).toContain("Subtotal");
    expect(text).toContain("Tax (10%)");
    expect(text).toContain("Total");
    expect(text).toContain("Notes");
    expect(text).toContain("Terms");
    expect(text).not.toContain("Paid");
    expect(text).not.toContain("Amount due");
    expect(text).not.toContain("Account Number");
    expect(text).not.toContain("ABA Routing");
    expect(text).not.toContain("Invoice ");
    const title = trace.find((item) => item.text === "Quotation Q-0001");
    expect(title).toMatchObject({ x: 28, y: 84 });
    const valid = trace.find((item) => item.text === "Valid until:");
    expect(valid?.x).toBe(407);
  });
});
