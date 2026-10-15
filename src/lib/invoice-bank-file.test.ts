import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInvoiceBankFile } from "../../scripts/invoice-bank-file.mjs";

describe("parseInvoiceBankFile", () => {
  it("drops # comments and blank lines at the ends, and keeps a blank line in the middle", () => {
    const parsed = parseInvoiceBankFile(
      ["# comment", "", "Beneficiary Name: Ulix Digital", "", "Account Number: 1", "", "# trailing", ""].join("\n"),
    );
    expect(parsed).toBe("Beneficiary Name: Ulix Digital\n\nAccount Number: 1");
    expect(parsed.includes("#")).toBe(false);
  });

  it("strips the comments from the example file", () => {
    const example = readFileSync("secrets/invoice-bank-details.example.txt", "utf8");
    const parsed = parseInvoiceBankFile(example);
    expect(parsed.startsWith("#")).toBe(false);
    expect(parsed.includes("\n#")).toBe(false);
    expect(parsed.startsWith("Beneficiary Name: Ulix Digital")).toBe(true);
    expect(parsed.endsWith("Bank Name: [not set]")).toBe(true);
  });
});
