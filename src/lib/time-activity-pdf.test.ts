import { describe, expect, it } from "vitest";
import { reportCopy } from "@/lib/report-copy";
import { pdfPlainText } from "@/lib/report-pdf";
import { slicesForEntry, type SourceEntry } from "@/lib/reports";
import {
  ACTIVITY_NOTES_MAX,
  activityNoAmount,
  buildTimeActivityModel,
  formatActivityDate,
  formatActivityDuration,
  formatActivityMoney,
  paginateActivity,
  renderTimeActivityPdf,
  type ActivityLine,
  type ActivitySlice,
} from "@/lib/time-activity-pdf";
import { zonedDayEnd, zonedDayStart } from "@/lib/time-zone";

function line(overrides: Partial<ActivityLine> = {}): ActivityLine {
  return {
    clientName: "Acme",
    date: "2026-09-28",
    memberName: "Sam Rivera",
    projectName: "Website",
    durationMs: 5 * 60 * 1000 + 22 * 1000,
    billableMs: 5 * 60 * 1000 + 22 * 1000,
    amount: { currency: "USD", amountMinor: 5000 },
    note: "",
    manual: false,
    edited: false,
    ...overrides,
  };
}

describe("time activity layout", () => {
  it("formats durations and money the way the reference does", () => {
    expect(formatActivityDuration(5 * 60 * 1000 + 22 * 1000)).toBe("0:05:22");
    expect(formatActivityDuration(10 * 60 * 60 * 1000)).toBe("10:00:00");
    expect(formatActivityDuration(28 * 3600 * 1000 + 55 * 60 * 1000 + 43 * 1000)).toBe("28:55:43");
    expect(formatActivityMoney([{ currency: "USD", amountMinor: 72322 }])).toBe("$723.22");
    expect(formatActivityMoney([{ currency: "JPY", amountMinor: 1500 }])).toBe("¥1,500");
    expect(formatActivityMoney([{ currency: "JPY", amountMinor: 0 }])).toBe("¥0");
    expect(formatActivityMoney([])).toBe("");
    expect(
      formatActivityMoney([
        { currency: "JPY", amountMinor: 1500 },
        { currency: "USD", amountMinor: 1000 },
      ]),
    ).toBe("¥1,500\n$10.00");
    expect(formatActivityDate("2026-09-28")).toBe("Mon, Sep 28, 2026");
    expect(formatActivityDate("2026-10-04")).toBe("Sun, Oct 4, 2026");
  });

  it("groups by client, date, and member, and totals each level", () => {
    const model = buildTimeActivityModel({
      from: "2026-09-28",
      to: "2026-10-04",
      showMoney: true,
      lines: [
        line({ clientName: "Zebra", memberName: "Sam Rivera", amount: { currency: "USD", amountMinor: 1000 } }),
        line({
          clientName: "Acme",
          date: "2026-09-29",
          memberName: "Jordan Blake-Alexander",
          projectName: "Brochure",
          durationMs: 60 * 60 * 1000,
          billableMs: 60 * 60 * 1000,
          amount: { currency: "USD", amountMinor: 2500 },
          note: "Called the client",
          manual: true,
        }),
        line({
          clientName: "Acme",
          date: "2026-09-28",
          memberName: "Sam Rivera",
          projectName: "Website",
          durationMs: 60 * 60 * 1000,
          billableMs: 0,
          amount: null,
          note: "  keep spaces  ",
        }),
        line({
          clientName: "Acme",
          date: "2026-09-28",
          memberName: "Sam Rivera",
          projectName: "",
          durationMs: 60 * 1000,
          billableMs: 60 * 1000,
          amount: { currency: "USD", amountMinor: 100 },
          edited: true,
        }),
        line({
          clientName: "Acme",
          date: "2026-09-28",
          memberName: "Ada Owner",
          projectName: "Website",
          edited: true,
        }),
      ],
    });

    expect(model.dateRange).toBe("Mon, Sep 28, 2026 - Sun, Oct 4, 2026");
    expect(model.organization).toBe("Ulix Digital");
    expect(model.clients.map((client) => client.name)).toEqual(["Acme", "Zebra"]);
    const acme = model.clients[0];
    expect(acme?.groups.map((group) => `${group.dateLabel}|${group.memberName}`)).toEqual([
      "Mon, Sep 28, 2026|Ada Owner",
      "Mon, Sep 28, 2026|Sam Rivera",
      "Tue, Sep 29, 2026|Jordan Blake-Alexander",
    ]);
    const sam = acme?.groups[1];
    expect(sam?.time).toBe("1:01:00");
    expect(sam?.billable).toBe("0:01:00");
    expect(sam?.billed).toBe("$1.00");
    expect(sam?.details.map((detail) => detail.todo)).toEqual([reportCopy.noTodo, "Website"]);
    expect(sam?.details[0]).toMatchObject({ missingTodo: true, notes: "Edited" });
    expect(sam?.details[1]?.notes).toBe("  keep spaces  ");
    expect(acme?.groups[2]?.details[0]?.notes).toBe("Manually added; Called the client");
    expect(acme?.groups[0]?.details[0]?.notes).toBe("Edited");
    expect(model.grand.time).toBe("2:11:44");
    expect(model.grand.billed).toBe("$86.00");
  });

  it("uses the workspace timezone when a slice crosses midnight", () => {
    const entry: SourceEntry = {
      id: "night",
      userId: "sam",
      userName: "Sam Rivera",
      projectId: "website",
      projectName: "Website",
      clientId: "acme",
      clientName: "Acme",
      startedAt: new Date("2026-09-28T18:00:00.000Z"),
      endedAt: new Date("2026-09-28T20:00:00.000Z"),
      billable: true,
      projectBillable: true,
      note: "",
      rate: { amountMinor: 10000, currency: "USD" },
      source: "timer",
    };
    const slices = slicesForEntry(
      entry,
      zonedDayStart("2026-09-28", "Asia/Colombo"),
      zonedDayEnd("2026-09-29", "Asia/Colombo"),
      "Asia/Colombo",
    );
    const model = buildTimeActivityModel({
      from: "2026-09-28",
      to: "2026-09-29",
      showMoney: true,
      lines: slices.map((slice) => ({
        clientName: slice.clientName,
        date: slice.date,
        memberName: slice.userName,
        projectName: slice.projectName,
        durationMs: slice.durationMs,
        billableMs: slice.billableMs,
        amount: slice.amount,
        note: slice.note,
        manual: slice.source === "manual",
        edited: slice.edited,
      })),
    });
    expect(slices.map((slice) => slice.date)).toEqual(["2026-09-28", "2026-09-29"]);
    expect(model.clients[0]?.groups.map((group) => group.time)).toEqual(["0:30:00", "1:30:00"]);
    expect(model.grand.time).toBe("2:00:00");
    expect(model.grand.billed).toBe("$200.00");
  });

  it("keeps each client's group subtotals when the date and member match", async () => {
    const model = buildTimeActivityModel({
      from: "2026-09-28",
      to: "2026-10-04",
      showMoney: true,
      lines: [
        line({
          clientName: "Acme",
          durationMs: 60 * 60 * 1000,
          billableMs: 60 * 60 * 1000,
          amount: { currency: "USD", amountMinor: 1000 },
        }),
        line({
          clientName: "Brightpath",
          projectName: "Mobile app",
          durationMs: 2 * 60 * 60 * 1000,
          billableMs: 2 * 60 * 60 * 1000,
          amount: { currency: "USD", amountMinor: 4000 },
        }),
      ],
    });
    expect(model.clients[0]?.groups[0]?.time).toBe("1:00:00");
    expect(model.clients[0]?.groups[0]?.billed).toBe("$10.00");
    expect(model.clients[1]?.groups[0]?.time).toBe("2:00:00");
    expect(model.clients[1]?.groups[0]?.billed).toBe("$40.00");
    expect(model.clients[0]?.groups[0]?.id).not.toBe(model.clients[1]?.groups[0]?.id);

    const pdf = await renderTimeActivityPdf({
      model,
      appUrl: "https://desk.example",
      compress: false,
    });
    const brightpath = pdfPlainText(pdf).slice(pdfPlainText(pdf).indexOf("Brightpath"));
    expect(brightpath).toContain("2:00:00");
    expect(brightpath).toContain("$40.00");
    expect(brightpath).not.toContain("1:00:00");
    expect(brightpath).not.toContain("$10.00");
  });

  it("omits money for a member", () => {
    const model = buildTimeActivityModel({
      from: "2026-09-28",
      to: "2026-10-04",
      showMoney: false,
      lines: [line()],
    });
    expect(model.showMoney).toBe(false);
    expect(model.grand.billed).toBe("");
    expect(model.clients[0]?.billed).toBe("");
    expect(model.clients[0]?.groups[0]?.billed).toBe("");
    expect(model.grand.time).toBe("0:05:22");
  });

  it("keeps a group row with its first detail and repeats the column header", () => {
    const pages = paginateActivity({
      firstRoom: 120,
      nextRoom: 120,
      sections: [
        {
          client: "Acme",
          heading: 10,
          columns: 10,
          total: 10,
          groups: [
            {
              id: "g1",
              height: 20,
              details: [
                { id: "d1", height: 30 },
                { id: "d2", height: 30 },
                { id: "d3", height: 30 },
              ],
            },
          ],
        },
      ],
    });
    expect(kinds(pages[0])).toEqual(["heading", "columns", "group", "detail", "detail"]);
    expect(kinds(pages[1])).toEqual(["heading", "columns", "detail", "total"]);
    expect(pages[1]?.find((slice) => slice.type === "heading")).toMatchObject({
      client: "Acme",
      continued: true,
    });
    expect(pages[0]?.some((slice) => slice.type === "group" && slice.id === "g1")).toBe(true);
    expect(pages[1]?.some((slice) => slice.type === "group")).toBe(false);
  });

  it("moves a group that would be orphaned at the bottom of the page", () => {
    const pages = paginateActivity({
      firstRoom: 90,
      nextRoom: 200,
      sections: [
        {
          client: "Acme",
          heading: 10,
          columns: 10,
          total: 10,
          groups: [
            { id: "g1", height: 20, details: [{ id: "d1", height: 20 }] },
            { id: "g2", height: 30, details: [{ id: "d2", height: 30 }] },
          ],
        },
      ],
    });
    expect(kinds(pages[0])).toEqual(["heading", "columns", "group", "detail"]);
    expect(pages[0]?.find((slice) => slice.type === "group")?.id).toBe("g1");
    expect(kinds(pages[1])).toEqual(["heading", "columns", "group", "detail", "total"]);
    expect(pages[1]?.find((slice) => slice.type === "heading")).toMatchObject({
      continued: true,
    });
    expect(pages[1]?.find((slice) => slice.type === "group")?.id).toBe("g2");
  });

  it("draws the reference header, totals, and a continuation page", async () => {
    const lines: ActivityLine[] = [];
    for (let index = 0; index < 28; index += 1) {
      lines.push(
        line({
          clientName: index % 2 === 0 ? "Acme" : "Brightpath",
          date: `2026-09-${String(28 + (index % 5)).padStart(2, "0")}`,
          memberName: index % 3 === 0 ? "Jordan Blake-Alexander" : "Sam Rivera",
          projectName: index === 3 ? "" : `Task ${index}`,
          manual: index === 1,
          note: index === 1 ? "Called the client" : "",
        }),
      );
    }
    const model = buildTimeActivityModel({
      lines,
      from: "2026-09-28",
      to: "2026-10-04",
      showMoney: true,
      timeZone: "Asia/Colombo",
      filterSummary: "Client: Acme · Billable: Billable",
    });
    const pdf = await renderTimeActivityPdf({
      model,
      appUrl: "https://desk.example",
      compress: false,
    });
    const text = pdfPlainText(pdf);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(text).toContain("Time & Activity Report");
    expect(text).toContain("Ulix Digital");
    expect(text).toContain("Mon, Sep 28, 2026 - Sun, Oct 4, 2026");
    expect(text).toContain("Grand total");
    expect(text).toContain("Acme");
    expect(text).toContain("Brightpath");
    expect(text.indexOf("Acme")).toBeLessThan(text.indexOf("Brightpath"));
    expect(text).toContain("(No to-do)");
    expect(text).toContain("Manually added; Called the client");
    expect(text).toContain("Total");
    expect(text).toContain("$");
    expect(text).toContain("Generated with");
    expect(text).toContain("https://desk.example");
    expect(text).toContain("Page 1 of");
    expect(text).toContain("Page 2 of");
    expect(text).toContain("Client: Acme · Billable: Billable");
    expect(text.split("Timezone: Asia/Colombo").length - 1).toBeGreaterThan(1);
    expect(text).toContain("(continued)");
    expect(text.split("To-do ID").length - 1).toBeGreaterThan(1);
    const declared = Number(text.match(/Page 1 of (\d+)/)?.[1]);
    expect(pdfPageCount(pdf)).toBe(declared);

    const member = buildTimeActivityModel({
      lines: [line()],
      from: "2026-09-28",
      to: "2026-10-04",
      showMoney: false,
    });
    const memberPdf = await renderTimeActivityPdf({
      model: member,
      appUrl: "https://desk.example",
      compress: false,
    });
    const memberText = pdfPlainText(memberPdf);
    expect(memberText).not.toMatch(/\$|Billed|USD/);
    expect(memberText).toContain("0:05:22");
    expect(memberText).toContain("Billable Time");
  });

  it("marks unrated time, leaves non-billable blank, and keeps each currency", () => {
    const model = buildTimeActivityModel({
      from: "2026-09-28",
      to: "2026-10-04",
      showMoney: true,
      lines: [
        line({
          clientName: "Acme",
          projectName: "Website",
          amount: null,
          billableMs: 60 * 60 * 1000,
          durationMs: 60 * 60 * 1000,
        }),
        line({
          clientName: "Acme",
          projectName: "Internal",
          amount: null,
          billableMs: 0,
          durationMs: 30 * 60 * 1000,
        }),
        line({
          clientName: "Acme",
          projectName: "Zero",
          amount: { currency: "USD", amountMinor: 0 },
          billableMs: 60 * 1000,
          durationMs: 60 * 1000,
        }),
        line({
          clientName: "Yen Co",
          projectName: "Support",
          amount: { currency: "JPY", amountMinor: 1500 },
          billableMs: 60 * 60 * 1000,
          durationMs: 60 * 60 * 1000,
        }),
        line({
          clientName: "Yen Co",
          projectName: "Launch",
          amount: { currency: "USD", amountMinor: 1000 },
          billableMs: 60 * 60 * 1000,
          durationMs: 60 * 60 * 1000,
        }),
      ],
    });

    const acme = model.clients[0];
    const unrated = acme?.groups[0]?.details.find((detail) => detail.todo === "Website");
    const internal = acme?.groups[0]?.details.find((detail) => detail.todo === "Internal");
    const zero = acme?.groups[0]?.details.find((detail) => detail.todo === "Zero");
    expect(unrated?.billed).toBe(activityNoAmount);
    expect(internal?.billed).toBe("");
    expect(zero?.billed).toBe("$0.00");
    expect(acme?.groups[0]?.billed).toBe(`$0.00\n${activityNoAmount}`);
    expect(acme?.billed).toBe(`$0.00\n${activityNoAmount}`);
    expect(acme?.billed).not.toContain("$0.00,");

    const yen = model.clients[1];
    expect(yen?.billed).toBe("¥1,500\n$10.00");
    expect(yen?.billed).not.toContain("¥1,500,");
    expect(yen?.groups[0]?.details.find((detail) => detail.todo === "Support")?.billed).toBe("¥1,500");
    expect(model.grand.billed).toBe(`¥1,500\n$10.00\n${activityNoAmount}`);
    expect(model.grand.billed).not.toMatch(/\$0\.00/);
  });

  it("truncates a long note so one row cannot fill the page", () => {
    const note = `Start ${"n".repeat(400)} end`;
    const model = buildTimeActivityModel({
      from: "2026-09-28",
      to: "2026-10-04",
      showMoney: true,
      lines: [line({ note, manual: true })],
    });
    const notes = model.clients[0]?.groups[0]?.details[0]?.notes ?? "";
    expect(notes.startsWith("Manually added; Start n")).toBe(true);
    expect(notes.endsWith("…")).toBe(true);
    expect(notes.length).toBeLessThanOrEqual(ACTIVITY_NOTES_MAX + 1);
    expect(notes).not.toContain("end");
  });
});

function kinds(page: ActivitySlice[] | undefined) {
  return page?.map((slice) => slice.type);
}

function pdfPageCount(buffer: Buffer) {
  const match = buffer.toString("latin1").match(/\/Type\s*\/Pages\b[\s\S]{0,120}?\/Count\s+(\d+)/);
  return match ? Number(match[1]) : 0;
}
