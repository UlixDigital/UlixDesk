import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("escapes formula prefixes and quotes special characters", () => {
    expect(csvCell("=cmd")).toBe("'=cmd");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("\t=1")).toBe("'\t=1");
    expect(csvCell("USD 10.00")).toBe("USD 10.00");
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(toCsv([["Name", "Amount"], ["=evil", "USD 1.00"], ["Acme, Inc", "JPY 1,500"]])).toBe(
      "Name,Amount\r\n'=evil,USD 1.00\r\n\"Acme, Inc\",\"JPY 1,500\"\r\n",
    );
  });
});
