import { describe, expect, it } from "vitest";
import { billAmountMinor } from "@/lib/money";
import { buildInvoiceLines, type InvoiceSlice } from "@/lib/invoice-lines";
import {
  formatDurationHms,
  formatInvoiceMoney,
  invoiceTotals,
  lineAmountMinor,
  parseDurationInput,
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
    expect(members.lines.map((line) => line.title)).toEqual(["Mia", "Noa"]);
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
