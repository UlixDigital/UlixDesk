import { describe, expect, it } from "vitest";
import { quotationsToCsv } from "@/lib/quotation-csv";

describe("quotation csv", () => {
  it("exports the list with the derived status and without bank details", () => {
    const csv = quotationsToCsv([
      {
        number: "ULXQ2100",
        lineDescriptions: "Weekly quotation: Homepage refresh\nand hosting",
        clientName: "WSI Web Enhancers",
        issueDate: "2026-11-01",
        validUntil: "2026-11-15",
        currency: "USD",
        subtotalMinor: 5000,
        taxMinor: 500,
        totalMinor: 5500,
        status: "expired",
      },
    ]);
    expect(csv).toContain("ULXQ2100");
    expect(csv).toContain("Line descriptions");
    expect(csv).toContain("Homepage refresh");
    expect(csv).toContain("and hosting");
    expect(csv).toContain("WSI Web Enhancers");
    expect(csv).toContain("Expired");
    expect(csv).toContain("50.00");
    expect(csv).toContain("5.00");
    expect(csv).toContain("55.00");
    expect(csv).not.toContain("Account Number");
    expect(csv).not.toContain("Amount due");
    expect(csv.split("\r\n")[0]).toContain("Valid until");
  });
});
