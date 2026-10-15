import { describe, expect, it } from "vitest";
import { reportCopy } from "@/lib/report-copy";
import {
  builtReportToTable,
  pdfPlainText,
  pdfText,
  renderReportPdf,
  timeChangesToBlocks,
} from "@/lib/report-pdf";
import { buildReport, type SourceEntry } from "@/lib/reports";
import { timeChangeCopy } from "@/lib/time-change-copy";
import { zonedDayEnd, zonedDayStart } from "@/lib/time-zone";

function entry(id: string, overrides: Partial<SourceEntry> = {}): SourceEntry {
  return {
    id,
    userId: "sam",
    userName: "Sam",
    projectId: "website",
    projectName: "Website",
    clientId: "acme",
    clientName: "Acme",
    startedAt: new Date("2026-10-14T09:00:00.000Z"),
    endedAt: new Date("2026-10-14T10:00:00.000Z"),
    billable: true,
    projectBillable: true,
    note: "Called the client",
    rate: { amountMinor: 5000, currency: "USD" },
    ...overrides,
  };
}

describe("report pdf", () => {
  it("keeps characters Helvetica can draw and replaces the rest", () => {
    expect(pdfText("USD 50.00 —")).toBe("USD 50.00 —");
    expect(pdfText("Before → after")).toBe("Before -> after");
    expect(pdfText("Café")).toBe("Café");
    expect(pdfText("snowman ☃")).toBe("snowman ?");
  });

  it("matches the screen totals and leaves money out of a member PDF", async () => {
    const owner = buildReport({
      kind: "time-activity",
      entries: [entry("one")],
      rangeStart: zonedDayStart("2026-10-12", "UTC"),
      rangeEnd: zonedDayEnd("2026-10-18", "UTC"),
      timeZone: "UTC",
      groupBy: "project",
      columns: ["hours", "billableHours", "amount"],
      showMoney: true,
      manager: true,
    });
    const pdf = await renderReportPdf({
      title: "Time & Activity",
      filters: ["Dates: Wednesday, October 14, 2026", "Timezone: UTC"],
      table: builtReportToTable(owner),
      empty: reportCopy.empty,
      compress: false,
    });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const text = pdfPlainText(pdf);
    expect(text).toContain("Time & Activity");
    expect(text).toContain("Timezone: UTC");
    expect(text).toContain("USD 50.00");
    expect(text).toContain(reportCopy.total);
    expect(text).toContain("Page 1 of 1");

    const member = buildReport({
      kind: "time-activity",
      entries: [entry("one", { rate: null })],
      rangeStart: zonedDayStart("2026-10-12", "UTC"),
      rangeEnd: zonedDayEnd("2026-10-18", "UTC"),
      timeZone: "UTC",
      groupBy: "project",
      columns: ["hours", "billableHours"],
      showMoney: false,
      manager: false,
    });
    const memberPdf = await renderReportPdf({
      title: "Time & Activity",
      filters: ["Timezone: UTC"],
      table: builtReportToTable(member),
      compress: false,
    });
    expect(pdfPlainText(memberPdf)).not.toMatch(/USD|JPY|Amount/);
  });

  it("draws time edits without amounts and stays inside a modest heap", async () => {
    const blocks = timeChangesToBlocks([
      {
        id: "c1",
        timeEntryId: "e1",
        action: "edited",
        actionLabel: timeChangeCopy.actionEdited,
        source: "web",
        sourceLabel: timeChangeCopy.sourceWeb,
        changedAt: "2026-10-14T10:00:00.000Z",
        whenLabel: "Oct 14, 2026, 10:00 AM",
        byline: "Edited by Olivia",
        forOther: false,
        unchanged: false,
        fields: [
          { label: timeChangeCopy.fieldNotes, before: "old", after: "new →", changed: true },
          { label: timeChangeCopy.fieldBillable, before: "Billable", after: "Billable", changed: false },
        ],
      },
    ]);
    const rows = Array.from({ length: 200 }, (_, index) => [
      `Project ${index}`,
      "1h",
      "1h",
      index % 2 === 0 ? "USD 10.00" : "JPY 1,500",
    ]);
    const before = process.memoryUsage();
    const pdf = await renderReportPdf({
      title: "Time & Activity",
      filters: ["Timezone: Asia/Colombo", "Client: Acme"],
      table: {
        columns: [
          { label: "Project", align: "left" },
          { label: "Hours", align: "left" },
          { label: "Billable hours", align: "left" },
          { label: "Amount (USD)", align: "right" },
        ],
        rows,
        totals: ["Total", "200h", "200h", "USD 1,000.00"],
      },
      blocks,
      compress: true,
    });
    const after = process.memoryUsage();
    const heapDelta = after.heapUsed - before.heapUsed;
    console.info(
      `pdf-bytes=${pdf.length} heap-delta=${heapDelta} rss=${after.rss} rss-delta=${after.rss - before.rss}`,
    );
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
    expect(heapDelta).toBeLessThan(50 * 1024 * 1024);
    const plain = await renderReportPdf({
      title: "Time edits",
      filters: ["Timezone: UTC"],
      blocks,
      compress: false,
    });
    const text = pdfPlainText(plain);
    expect(text).toContain("Edited by Olivia");
    expect(text).toContain("Notes: old -> new ->");
    expect(text).not.toMatch(/USD|JPY|Amount/);
    expect(text).toContain("Page 1 of");
  });
});
