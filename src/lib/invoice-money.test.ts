import { describe, expect, it } from "vitest";
import { billAmountMinor } from "@/lib/money";
import { buildInvoiceLines, type InvoiceSlice } from "@/lib/invoice-lines";
import {
  formatDurationHms,
  formatInvoiceMoney,
  formatItemQuantity,
  formatQuantityMs,
  invoiceLineQuantity,
  invoiceTotals,
  lineAmountFromCount,
  lineAmountFromMs,
  lineAmountMinor,
  parseDurationInput,
  parseItemQuantity,
  parseQuantityInput,
  percentOfMinor,
  periodLineTitle,
  secondsFromMs,
} from "@/lib/invoice-money";

const hour = 3_600_000;

function slice(patch: Partial<InvoiceSlice> & Pick<InvoiceSlice, "timeEntryId" | "rateMinor">): InvoiceSlice {
  return {
    projectId: "project",
    projectName: "Website",
    userId: "member",
    userName: "Mia",
    day: "2026-10-06",
    durationMs: hour,
    sliceStart: new Date("2026-10-06T02:30:00.000Z"),
    sliceEnd: new Date("2026-10-06T03:30:00.000Z"),
    unratedReason: patch.rateMinor === null ? "no-rate" : null,
    ...patch,
  };
}

describe("invoice money", () => {
  it("rounds a line with the bill-rate rule, including yen", () => {
    expect(lineAmountMinor(2500, 26 * 3600 + 22 * 60 + 12)).toBe(65925);
    expect(formatInvoiceMoney(65925, "USD")).toBe("$659.25");
    expect(billAmountMinor(1500, 30 * 60 * 1000)).toBe(750);
    expect(lineAmountMinor(1500, 30 * 60)).toBe(750);
    expect(formatInvoiceMoney(1500, "JPY")).toBe("¥1,500");
    expect(formatInvoiceMoney(750, "JPY")).toBe("¥750");
  });

  it("applies a percent or amount discount before tax", () => {
    expect(percentOfMinor(65925, 850)).toBe(5604);
    const percent = invoiceTotals({
      lineAmounts: [10_000],
      discountKind: "percent",
      discountAmountMinor: 0,
      discountBps: 1000,
      taxEnabled: true,
      taxRateBps: 1000,
    });
    expect(percent).toEqual({ subtotalMinor: 10_000, discountMinor: 1_000, taxMinor: 900, totalMinor: 9_900 });
    const amount = invoiceTotals({
      lineAmounts: [10_000],
      discountKind: "amount",
      discountAmountMinor: 2_500,
      discountBps: 0,
      taxEnabled: true,
      taxRateBps: 500,
    });
    expect(amount).toEqual({ subtotalMinor: 10_000, discountMinor: 2_500, taxMinor: 375, totalMinor: 7_875 });
  });

  it("parses H:MM:SS and rounds milliseconds half up", () => {
    expect(parseDurationInput("26:22:12")).toEqual({ ok: true, seconds: 94932 });
    expect(parseDurationInput("26:22")).toEqual({ ok: true, seconds: 94920 });
    expect(parseDurationInput("26:60:00").ok).toBe(false);
    expect(secondsFromMs(1499)).toBe(1);
    expect(secondsFromMs(499)).toBe(0);
    expect(formatDurationHms(94932)).toBe("26:22:12");
    expect(periodLineTitle("2026-10-05", "2026-10-11")).toBe("Weekly Invoice");
    expect(periodLineTitle("2026-10-05", "2026-10-10")).toBe("Invoice");
  });

  it("stores a plain hour quantity as exact milliseconds and rounds the amount like a bill rate", () => {
    expect(parseQuantityInput("1:30:00")).toEqual({ ok: true, ms: 5_400_000n, seconds: 5400 });
    expect(parseQuantityInput("1.5")).toEqual({ ok: true, ms: 5_400_000n, seconds: 5400 });
    expect(parseQuantityInput("1.25")).toEqual({ ok: true, ms: 4_500_000n, seconds: 4500 });
    expect(parseQuantityInput("0.00001")).toEqual({ ok: true, ms: 36n, seconds: 0 });
    expect(parseQuantityInput("1.00001")).toEqual({ ok: true, ms: 3_600_036n, seconds: 3600 });
    expect(parseQuantityInput("1.000001").ok).toBe(false);
    expect(parseQuantityInput("1.5.0").ok).toBe(false);
    expect(formatQuantityMs(5_400_000n)).toBe("1:30:00");
    expect(formatQuantityMs(36n)).toBe("0.00001");
    expect(lineAmountFromMs(2500, 5_400_000n)).toBe(3750);
    expect(lineAmountFromMs(2500, 3_603_600n)).toBe(2503);
    const halfSecondWouldDiffer = lineAmountFromMs(10_000, 1_440n);
    expect(halfSecondWouldDiffer).toBe(4);
    expect(lineAmountMinor(10_000, 1)).toBe(3);
    const totals = invoiceTotals({
      lineAmounts: [lineAmountFromMs(4000, 5_400_000n), lineAmountMinor(2500, 7200)],
      discountKind: "percent",
      discountAmountMinor: 0,
      discountBps: 1000,
      taxEnabled: true,
      taxRateBps: 850,
    });
    expect(totals).toEqual({ subtotalMinor: 11_000, discountMinor: 1_100, taxMinor: 842, totalMinor: 10_742 });
  });

  it("bills an item as a plain count times the unit price", () => {
    expect(parseItemQuantity("1")).toEqual({ ok: true, scaled: 100_000n });
    expect(parseItemQuantity("1.5")).toEqual({ ok: true, scaled: 150_000n });
    expect(parseItemQuantity("1:00:00").ok).toBe(false);
    expect(formatItemQuantity(100_000n)).toBe("1");
    expect(formatItemQuantity(150_000n)).toBe("1.5");
    expect(lineAmountFromCount(50_000, 100_000n)).toBe(50_000);
    expect(lineAmountFromCount(2_000, 150_000n)).toBe(3_000);
    expect(
      invoiceLineQuantity({ quantitySeconds: 0, quantityMs: 100_000n, quantityKind: "item" }),
    ).toBe("1");
    expect(invoiceLineQuantity({ quantitySeconds: 3600, quantityMs: 3_600_000n, quantityKind: "hours" })).toBe("1:00:00");
  });

  it("refuses a discount larger than the subtotal", () => {
    expect(() =>
      invoiceTotals({
        lineAmounts: [5_000],
        discountKind: "amount",
        discountAmountMinor: 5_001,
        discountBps: 0,
        taxEnabled: false,
        taxRateBps: 0,
      }),
    ).toThrow(/subtotal/);
  });
});

describe("invoice line grouping", () => {
  it("splits mixed rates so quantity times unit price equals the line amount", () => {
    const quarter = hour / 4;
    const built = buildInvoiceLines({
      grouping: "period",
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      slices: [
        slice({ timeEntryId: "a", rateMinor: 1, durationMs: quarter }),
        slice({ timeEntryId: "b", rateMinor: 1, durationMs: quarter }),
        slice({ timeEntryId: "c", rateMinor: 2500, durationMs: hour, day: "2026-10-07" }),
      ],
    });
    expect(billAmountMinor(1, quarter) + billAmountMinor(1, quarter)).toBe(0);
    const combined = built.lines.find((line) => line.unitPriceMinor === 1);
    expect(combined?.title).toBe("Website");
    expect(combined?.quantitySeconds).toBe(1800);
    expect(combined?.amountMinor).toBe(1);
    expect(combined?.timeEntryIds).toEqual(["a", "b"]);
    const full = built.lines.find((line) => line.unitPriceMinor === 2500);
    expect(full?.amountMinor).toBe(2500);
    expect(built.lines.every((line) => line.amountMinor === lineAmountMinor(line.unitPriceMinor, line.quantitySeconds))).toBe(
      true,
    );
  });

  it("leaves unrated time off the invoice and names it", () => {
    const built = buildInvoiceLines({
      grouping: "project",
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      slices: [
        slice({ timeEntryId: "rated", rateMinor: 2500, projectName: "Website" }),
        slice({
          timeEntryId: "open",
          rateMinor: null,
          projectName: "Support",
          userName: "Noa",
          unratedReason: "no-rate",
        }),
        slice({
          timeEntryId: "yen",
          rateMinor: null,
          projectName: "Support",
          userName: "Noa",
          day: "2026-10-07",
          unratedReason: "currency",
        }),
      ],
    });
    expect(built.lines).toHaveLength(1);
    expect(built.lines[0]?.title).toBe("Website");
    expect(built.unrated.map((item) => item.timeEntryId)).toEqual(["open", "yen"]);
    expect(built.unrated[1]?.reason).toBe("currency");
  });

  it("groups per member and per day", () => {
    const slices = [
      slice({ timeEntryId: "a", rateMinor: 1000, userName: "Mia", day: "2026-10-05" }),
      slice({ timeEntryId: "b", rateMinor: 1000, userName: "Noa", day: "2026-10-06" }),
    ];
    const members = buildInvoiceLines({
      grouping: "member",
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      slices,
    });
    expect(members.lines.map((line) => line.title)).toEqual(["Website · Mia", "Website · Noa"]);
    const days = buildInvoiceLines({
      grouping: "day",
      periodStart: "2026-10-05",
      periodEnd: "2026-10-11",
      slices,
    });
    expect(days.lines.map((line) => line.title)).toEqual(["Mon, Oct 5, 2026", "Tue, Oct 6, 2026"]);
    expect(days.lines[0]?.detail).toBe("");
  });
});
