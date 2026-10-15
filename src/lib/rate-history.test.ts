import { describe, expect, it } from "vitest";
import { collapseRateHistory, currentRateIds } from "@/lib/rate-history";

describe("rate history", () => {
  const rows = [
    { id: "future", userId: null, effectiveFrom: "2026-12-01", amountMinor: 9000 },
    { id: "bo", userId: "bo", effectiveFrom: "2026-11-01", amountMinor: 1000 },
    { id: "new", userId: null, effectiveFrom: "2026-04-01", amountMinor: 8000 },
    { id: "old-same", userId: null, effectiveFrom: "2026-04-01", amountMinor: 5000 },
    { id: "ada-new", userId: "ada", effectiveFrom: "2026-03-01", amountMinor: 7000 },
    { id: "ada-old", userId: "ada", effectiveFrom: "2026-03-01", amountMinor: 6000 },
    { id: "earlier", userId: null, effectiveFrom: "2026-01-01", amountMinor: 4000 },
  ];

  it("keeps the latest save for a date and a Current rate for today", () => {
    const visible = collapseRateHistory(rows);
    expect(visible.map((row) => row.id)).toEqual(["future", "bo", "new", "ada-new", "earlier"]);
    expect(currentRateIds(visible, "2026-10-15")).toEqual(["new", "ada-new"]);
    expect(currentRateIds([{ id: "future", userId: null, effectiveFrom: "2026-12-01" }], "2026-10-15")).toEqual(
      [],
    );
  });
});
