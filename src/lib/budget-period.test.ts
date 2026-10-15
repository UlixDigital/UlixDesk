import { describe, expect, it } from "vitest";
import { budgetCopy } from "@/lib/budget-copy";
import {
  budgetFigures,
  budgetWindow,
  measureBudgetUse,
  parseAlertPercent,
  parseBudgetStart,
  parseHoursAmount,
  type BudgetEntrySlice,
  type BudgetSpec,
} from "@/lib/budget-period";
import { zonedDayStart } from "@/lib/time-zone";

const COLOMBO = "Asia/Colombo";
const NEW_YORK = "America/New_York";

function at(iso: string) {
  return new Date(iso);
}

function hoursSpec(overrides: Partial<BudgetSpec> = {}): BudgetSpec {
  return {
    basis: "hours",
    amount: 10 * 3600,
    currency: null,
    recurrence: "total",
    startsOn: null,
    billableOnly: true,
    alertPercent: 80,
    hardStop: true,
    ...overrides,
  };
}

function entry(overrides: Partial<BudgetEntrySlice> = {}): BudgetEntrySlice {
  return {
    startedAtMs: Date.parse("2026-03-04T04:00:00.000Z"),
    endedAtMs: Date.parse("2026-03-04T05:00:00.000Z"),
    billable: true,
    rateMinor: null,
    rateCurrency: null,
    ...overrides,
  };
}

describe("budget windows", () => {
  it("splits the month on the Colombo date, including a non-leap February", () => {
    const february = budgetWindow({
      recurrence: "monthly",
      startsOn: null,
      timeZone: COLOMBO,
      now: at("2026-02-28T18:29:00.000Z"),
    });
    expect(february.from).toBe("2026-02-01");
    expect(february.to).toBe("2026-02-28");
    expect(february.startMs).toBe(zonedDayStart("2026-02-01", COLOMBO).getTime());
    expect(february.endMs).toBe(zonedDayStart("2026-03-01", COLOMBO).getTime());

    const march = budgetWindow({
      recurrence: "monthly",
      startsOn: null,
      timeZone: COLOMBO,
      now: at("2026-02-28T18:30:00.000Z"),
    });
    expect(march.from).toBe("2026-03-01");
    expect(march.to).toBe("2026-03-31");
  });

  it("keeps 29 February inside February of a leap year", () => {
    const window = budgetWindow({
      recurrence: "monthly",
      startsOn: null,
      timeZone: COLOMBO,
      now: at("2024-02-29T12:00:00.000Z"),
    });
    expect(window.from).toBe("2024-02-01");
    expect(window.to).toBe("2024-02-29");
  });

  it("uses Monday through Sunday and clips a start date inside the week", () => {
    const week = budgetWindow({
      recurrence: "weekly",
      startsOn: null,
      timeZone: COLOMBO,
      now: zonedDayStart("2026-03-04", COLOMBO),
    });
    expect(week.from).toBe("2026-03-02");
    expect(week.to).toBe("2026-03-08");

    const sunday = budgetWindow({
      recurrence: "weekly",
      startsOn: null,
      timeZone: COLOMBO,
      now: zonedDayStart("2026-03-01", COLOMBO),
    });
    expect(sunday.to).toBe("2026-03-01");
    expect(sunday.from).toBe("2026-02-23");

    const late = entry({
      startedAtMs: Date.parse("2026-03-08T17:00:00.000Z"),
      endedAtMs: Date.parse("2026-03-08T17:45:00.000Z"),
    });
    const inside = measureBudgetUse(hoursSpec({ recurrence: "weekly", alertPercent: null, hardStop: false }), [late], week);
    expect(inside.includedMs).toBe(45 * 60 * 1000);

    const nextWeek = entry({
      startedAtMs: Date.parse("2026-03-08T18:30:00.000Z"),
      endedAtMs: Date.parse("2026-03-08T19:00:00.000Z"),
    });
    expect(
      measureBudgetUse(hoursSpec({ recurrence: "weekly" }), [nextWeek], week).includedMs,
    ).toBe(0);
    expect(
      measureBudgetUse(hoursSpec({ recurrence: "weekly" }), [entry()], sunday).includedMs,
    ).toBe(0);
  });

  it("clips a monthly window to the start date and stays idle before it", () => {
    const started = budgetWindow({
      recurrence: "monthly",
      startsOn: "2026-03-15",
      timeZone: COLOMBO,
      now: zonedDayStart("2026-03-20", COLOMBO),
    });
    expect(started.notStarted).toBe(false);
    expect(started.from).toBe("2026-03-15");
    expect(started.to).toBe("2026-03-31");
    expect(started.startMs).toBe(zonedDayStart("2026-03-15", COLOMBO).getTime());

    const waiting = budgetWindow({
      recurrence: "monthly",
      startsOn: "2026-03-15",
      timeZone: COLOMBO,
      now: zonedDayStart("2026-03-10", COLOMBO),
    });
    expect(waiting.notStarted).toBe(true);
    const figures = budgetFigures(
      hoursSpec({ recurrence: "monthly", startsOn: "2026-03-15", hardStop: true }),
      measureBudgetUse(hoursSpec(), [entry()], waiting),
    );
    expect(figures.notStarted).toBe(true);
    expect(figures.blocks).toBe(false);
    expect(figures.usedLabel).toContain("0.00");
  });

  it("resolves New York month boundaries across the daylight-saving change", () => {
    const march = budgetWindow({
      recurrence: "monthly",
      startsOn: null,
      timeZone: NEW_YORK,
      now: zonedDayStart("2026-03-15", NEW_YORK),
    });
    expect(march.startMs).toBe(Date.parse("2026-03-01T05:00:00.000Z"));
    const november = budgetWindow({
      recurrence: "monthly",
      startsOn: null,
      timeZone: NEW_YORK,
      now: zonedDayStart("2026-11-15", NEW_YORK),
    });
    expect(november.startMs).toBe(Date.parse("2026-11-01T04:00:00.000Z"));
  });
});

describe("budget thresholds", () => {
  it("warns at the alert and blocks only after the limit is already reached", () => {
    const spec = hoursSpec();
    const hour = 3_600_000;
    const under = budgetFigures(spec, {
      includedMs: 8 * hour - 1,
      costMinor: 0,
      unrated: false,
      notStarted: false,
    });
    expect(under.warning).toBe(false);
    expect(under.blocks).toBe(false);

    const alert = budgetFigures(spec, {
      includedMs: 8 * hour,
      costMinor: 0,
      unrated: false,
      notStarted: false,
    });
    expect(alert.warning).toBe(true);
    expect(alert.reached).toBe(false);
    expect(alert.blocks).toBe(false);
    expect(alert.percentLabel).toBe("80%");

    const reached = budgetFigures(spec, {
      includedMs: 10 * hour,
      costMinor: 0,
      unrated: false,
      notStarted: false,
    });
    expect(reached.reached).toBe(true);
    expect(reached.blocks).toBe(true);
    expect(reached.warning).toBe(true);

    const open = budgetFigures(
      { ...spec, hardStop: false },
      { includedMs: 10 * hour, costMinor: 0, unrated: false, notStarted: false },
    );
    expect(open.reached).toBe(true);
    expect(open.blocks).toBe(false);
  });

  it("compares cost in minor units and keeps an unrated rate from blocking on its own", () => {
    const spec: BudgetSpec = {
      basis: "cost",
      amount: 10_000,
      currency: "USD",
      recurrence: "total",
      startsOn: null,
      billableOnly: true,
      alertPercent: 80,
      hardStop: true,
    };
    const below = budgetFigures(spec, {
      includedMs: 1,
      costMinor: 7999,
      unrated: false,
      notStarted: false,
    });
    expect(below.warning).toBe(false);
    const alert = budgetFigures(spec, {
      includedMs: 1,
      costMinor: 8000,
      unrated: false,
      notStarted: false,
    });
    expect(alert.warning).toBe(true);
    expect(alert.reached).toBe(false);
    const reached = budgetFigures(spec, {
      includedMs: 1,
      costMinor: 10_000,
      unrated: false,
      notStarted: false,
    });
    expect(reached.reached).toBe(true);
    expect(reached.blocks).toBe(true);

    const window = budgetWindow({
      recurrence: "total",
      startsOn: null,
      timeZone: COLOMBO,
      now: at("2026-03-04T12:00:00.000Z"),
    });
    const mixed = measureBudgetUse(
      spec,
      [
        entry({
          startedAtMs: Date.parse("2026-03-04T04:00:00.000Z"),
          endedAtMs: Date.parse("2026-03-04T04:36:00.000Z"),
          rateMinor: 10_000,
          rateCurrency: "USD",
        }),
        entry({
          startedAtMs: Date.parse("2026-03-04T06:00:00.000Z"),
          endedAtMs: Date.parse("2026-03-04T07:00:00.000Z"),
          rateMinor: 10_000,
          rateCurrency: "EUR",
        }),
      ],
      window,
    );
    expect(mixed.unrated).toBe(true);
    expect(mixed.costMinor).toBeLessThan(10_000);
    const figures = budgetFigures(spec, mixed);
    expect(figures.blocks).toBe(false);
    expect(figures.usedLabel).toContain("USD");
    expect(figures.usedLabel).toContain("—");
    expect(figures.remainingLabel).toBe("—");
    expect(figures.percentLabel).toBe("—");
    expect(figures.unrated).toBe(true);
  });

  it("ignores non-billable time on a billable-only budget and does not call it unrated", () => {
    const window = budgetWindow({
      recurrence: "total",
      startsOn: null,
      timeZone: COLOMBO,
      now: at("2026-03-04T12:00:00.000Z"),
    });
    const use = measureBudgetUse(
      hoursSpec({ basis: "cost", amount: 5000, currency: "USD", billableOnly: true }),
      [entry({ billable: false, rateMinor: null, rateCurrency: null })],
      window,
    );
    expect(use.includedMs).toBe(0);
    expect(use.unrated).toBe(false);
  });
});

describe("budget form parsers", () => {
  it("stores hours as seconds and rejects a blank or out-of-range alert", () => {
    expect(parseHoursAmount("1.50")).toEqual({ ok: true, seconds: 5400 });
    expect(parseHoursAmount("0.01")).toEqual({ ok: true, seconds: 36 });
    expect(parseHoursAmount("1.555").ok).toBe(false);
    expect(parseHoursAmount("0").ok).toBe(false);
    expect(parseAlertPercent("")).toEqual({ ok: true, percent: null });
    expect(parseAlertPercent("80")).toEqual({ ok: true, percent: 80 });
    expect(parseAlertPercent("0").ok).toBe(false);
    expect(parseAlertPercent("100").ok).toBe(false);
    expect(parseBudgetStart("")).toEqual({ ok: true, startsOn: null });
    expect(parseBudgetStart("2026-02-31").ok).toBe(false);
    expect(budgetCopy.reached.length).toBeGreaterThan(0);
  });
});
