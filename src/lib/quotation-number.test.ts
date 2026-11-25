import { describe, expect, it } from "vitest";
import { formatQuotationNumber } from "@/lib/quotation-number";

describe("quotation numbers", () => {
  it("uses its own padded sequence", () => {
    expect(formatQuotationNumber("Q", 1)).toBe("Q-0001");
    expect(formatQuotationNumber("Q", 42)).toBe("Q-0042");
    expect(formatQuotationNumber("Q", 10000)).toBe("Q-10000");
    expect(formatQuotationNumber("Q", 1)).not.toBe("LE1176");
  });
});
