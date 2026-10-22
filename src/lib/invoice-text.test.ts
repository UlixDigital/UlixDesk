import { describe, expect, it } from "vitest";
import { normalizeInvoiceText } from "@/lib/invoice-text";
import { pdfText } from "@/lib/report-pdf";

describe("invoice line endings", () => {
  it("turns CRLF and a lone CR into LF before the PDF font can print a question mark", () => {
    const windows = "Thanks.\r\nAccount: 0000\rRouting: 000000000";
    const normalized = normalizeInvoiceText(windows);
    expect(normalized).toBe("Thanks.\nAccount: 0000\nRouting: 000000000");
    expect(pdfText(windows)).toContain("?");
    expect(pdfText(normalized)).toBe(normalized);
    expect(pdfText(normalized).includes("?")).toBe(false);
  });
});
