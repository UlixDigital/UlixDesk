import { describe, expect, it } from "vitest";
import {
  agingBucket,
  calendarDaysBetween,
  invoiceBalance,
  isOverdue,
  parsePaymentInput,
  statusForPayments,
} from "@/lib/invoice-balance";
import { invoiceCopy } from "@/lib/invoice-copy";

describe("invoice balance", () => {
  it("keeps paid plus amount due equal to the total", () => {
    for (const [total, paid] of [
      [0, 0],
      [100, 0],
      [100, 40],
      [100, 100],
      [1, 1],
    ] as const) {
      const balance = invoiceBalance(total, paid);
      expect(balance.paidMinor + balance.dueMinor).toBe(total);
      expect(balance.balanced).toBe(true);
    }
    expect(statusForPayments(10000, 4000)).toBe("open");
    expect(statusForPayments(10000, 10000)).toBe("paid");
    expect(statusForPayments(0, 0)).toBe("open");
  });
});

describe("overdue and aging buckets", () => {
  const asOf = "2026-10-15";

  it("treats due today as current and not overdue", () => {
    expect(calendarDaysBetween(asOf, asOf)).toBe(0);
    expect(agingBucket(0)).toBe("current");
    expect(isOverdue({ dueDate: asOf, today: asOf, dueMinor: 500 })).toBe(false);
    expect(isOverdue({ dueDate: "2026-10-16", today: asOf, dueMinor: 500 })).toBe(false);
    expect(isOverdue({ dueDate: "2026-10-14", today: asOf, dueMinor: 500 })).toBe(true);
    expect(isOverdue({ dueDate: "2026-10-14", today: asOf, dueMinor: 0 })).toBe(false);
  });

  it("places 0, 1, 30, 31, 60, 61, 90, and 91 days in the right buckets", () => {
    expect(agingBucket(0)).toBe("current");
    expect(agingBucket(1)).toBe("d1");
    expect(agingBucket(30)).toBe("d1");
    expect(agingBucket(31)).toBe("d31");
    expect(agingBucket(60)).toBe("d31");
    expect(agingBucket(61)).toBe("d61");
    expect(agingBucket(90)).toBe("d61");
    expect(agingBucket(91)).toBe("d91");
    expect(agingBucket(-3)).toBe("current");
  });
});

describe("parse payment input", () => {
  it("accepts a positive amount and refuses zero, a bad method, and a long note", () => {
    expect(
      parsePaymentInput({
        amount: "40.00",
        currency: "USD",
        paidOn: "2026-10-15",
        method: "bank_transfer",
        note: " wire ",
      }),
    ).toEqual({
      ok: true,
      amountMinor: 4000,
      paidOn: "2026-10-15",
      method: "bank_transfer",
      note: "wire",
    });
    expect(parsePaymentInput({ amount: "0", currency: "USD", paidOn: "2026-10-15", method: "cash", note: "" }).ok).toBe(
      false,
    );
    expect(
      parsePaymentInput({ amount: "10", currency: "USD", paidOn: "2026-10-15", method: "paypal", note: "" }),
    ).toEqual({ ok: false, error: invoiceCopy.paymentMethodInvalid });
    expect(
      parsePaymentInput({
        amount: "10",
        currency: "USD",
        paidOn: "2026-10-15",
        method: "cash",
        note: "x".repeat(501),
      }).ok,
    ).toBe(false);
  });

  it("accepts a thousands comma and refuses any other comma", () => {
    expect(
      parsePaymentInput({ amount: "1,000", currency: "USD", paidOn: "2026-10-15", method: "cash", note: "" }),
    ).toMatchObject({ ok: true, amountMinor: 100_000 });
    expect(
      parsePaymentInput({ amount: "1,000.50", currency: "USD", paidOn: "2026-10-15", method: "cash", note: "" }),
    ).toMatchObject({ ok: true, amountMinor: 100_050 });
    expect(
      parsePaymentInput({ amount: "1,000", currency: "JPY", paidOn: "2026-10-15", method: "cash", note: "" }),
    ).toMatchObject({ ok: true, amountMinor: 1000 });
    expect(
      parsePaymentInput({ amount: "1,00", currency: "USD", paidOn: "2026-10-15", method: "cash", note: "" }),
    ).toEqual({ ok: false, error: invoiceCopy.paymentAmountGrouped });
    expect(
      parsePaymentInput({ amount: "1.000,50", currency: "USD", paidOn: "2026-10-15", method: "cash", note: "" }),
    ).toEqual({ ok: false, error: invoiceCopy.paymentAmountGrouped });
    expect(
      parsePaymentInput({ amount: "1,000.5", currency: "JPY", paidOn: "2026-10-15", method: "cash", note: "" }),
    ).toEqual({ ok: false, error: invoiceCopy.paymentAmountInvalid });
  });
});
