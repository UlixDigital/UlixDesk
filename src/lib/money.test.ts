import { describe, expect, it } from "vitest";
import { billAmountMinor, formatMoney, parseRateInput, sumMoney } from "@/lib/money";

describe("parseRateInput", () => {
  it("converts a decimal string into minor units without using floats", () => {
    expect(parseRateInput("10", "USD")).toEqual({ ok: true, amountMinor: 1000 });
    expect(parseRateInput("10.5", "USD")).toEqual({ ok: true, amountMinor: 1050 });
    expect(parseRateInput("10.50", "USD")).toEqual({ ok: true, amountMinor: 1050 });
    expect(parseRateInput(" 0.50 ", "USD")).toEqual({ ok: true, amountMinor: 50 });
    expect(parseRateInput("1500", "JPY")).toEqual({ ok: true, amountMinor: 1500 });
    expect(parseRateInput("1.234", "BHD")).toEqual({ ok: true, amountMinor: 1234 });
    expect(parseRateInput("0", "USD")).toEqual({ ok: true, amountMinor: 0 });
  });

  it("rejects extra precision, junk, and amounts that do not fit", () => {
    expect(parseRateInput("10.501", "USD").ok).toBe(false);
    expect(parseRateInput("10.501", "USD")).toMatchObject({
      code: "RATE_TOO_PRECISE",
      error: "This currency allows 2 decimal places.",
    });
    expect(parseRateInput("1500.0", "JPY")).toMatchObject({
      code: "RATE_TOO_PRECISE",
      error: "This currency uses whole numbers only.",
    });
    expect(parseRateInput("1.2345", "BHD")).toMatchObject({ code: "RATE_TOO_PRECISE" });
    expect(parseRateInput("", "USD")).toMatchObject({ code: "RATE_INVALID" });
    expect(parseRateInput("10.00 USD", "USD")).toMatchObject({ code: "RATE_INVALID" });
    expect(parseRateInput("-5", "USD")).toMatchObject({ code: "RATE_INVALID" });
    expect(parseRateInput("21474836.48", "USD")).toMatchObject({
      code: "RATE_INVALID",
      error: "Enter a smaller hourly rate.",
    });
  });
});

describe("billAmountMinor", () => {
  const hour = 3_600_000;

  it("rounds half away from zero to the minor unit", () => {
    expect(billAmountMinor(1000, hour)).toBe(1000);
    expect(billAmountMinor(1000, hour / 2)).toBe(500);
    expect(billAmountMinor(1000, hour / 3)).toBe(333);
    expect(billAmountMinor(1000, hour / 6)).toBe(167);
    expect(billAmountMinor(1, hour / 2)).toBe(1);
    expect(billAmountMinor(1, hour / 2 - 1)).toBe(0);
    expect(billAmountMinor(0, hour)).toBe(0);
    expect(billAmountMinor(1000, 0)).toBe(0);
    expect(billAmountMinor(1000, -1)).toBe(0);
  });

  it("can differ by one minor unit when a duration is rounded in slices", () => {
    const full = billAmountMinor(1, hour / 2);
    const halves = billAmountMinor(1, hour / 4) + billAmountMinor(1, hour / 4);
    expect(full).toBe(1);
    expect(halves).toBe(0);
  });
});

describe("formatMoney", () => {
  it("prints the currency code and the right number of decimal places", () => {
    expect(formatMoney(125050, "USD")).toBe("USD 1,250.50");
    expect(formatMoney(1500, "JPY")).toBe("JPY 1,500");
    expect(formatMoney(1234, "BHD")).toBe("BHD 1.234");
    expect(formatMoney(0, "USD")).toBe("USD 0.00");
  });

  it("never adds two currencies together", () => {
    expect(
      sumMoney([
        { currency: "USD", amountMinor: 100 },
        { currency: "LKR", amountMinor: 50 },
        { currency: "USD", amountMinor: 25 },
        null,
      ]),
    ).toEqual([
      { currency: "LKR", amountMinor: 50 },
      { currency: "USD", amountMinor: 125 },
    ]);
  });
});
