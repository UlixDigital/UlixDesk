import { describe, expect, it } from "vitest";
import { formatQuotationNumber } from "@/lib/quotation-number";

describe("quotation numbers", () => {
  it("uses ULXQ and the counter with no separator", () => {
    expect(formatQuotationNumber("ULXQ", 2100)).toBe("ULXQ2100");
    expect(formatQuotationNumber("ULXQ", 2101)).toBe("ULXQ2101");
    expect(formatQuotationNumber("ULXQ", 10000)).toBe("ULXQ10000");
    expect(formatQuotationNumber("ULXQ", 2100)).not.toBe("LE1176");
    expect(formatQuotationNumber("ULXQ", 2100)).not.toContain("-");
  });
});
