import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { reportCopy } from "@/lib/report-copy";
import { slicesForEntry, type SourceEntry } from "@/lib/reports";
import { referenceActivityLines } from "@/lib/time-activity-sample";
import {
  ACTIVITY_NOTES_MAX,
  ACTIVITY_REPORT_HOST,
  activityFooterHost,
  activityNoAmount,
  buildTimeActivityModel,
  formatActivityDate,
  formatActivityDuration,
  formatActivityMoney,
  paginateActivity,
  renderTimeActivityPdf,
  type ActivityLine,
  type ActivityPdfRun,
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

  it("uses the public hostname in the footer", () => {
    expect(activityFooterHost("https://desk.example/app")).toBe("desk.example");
    expect(activityFooterHost("desk.custom.com")).toBe("desk.custom.com");
    expect(activityFooterHost("")).toBe(ACTIVITY_REPORT_HOST);
    expect(activityFooterHost("not a host")).toBe(ACTIVITY_REPORT_HOST);
    const previous = process.env.ULIXDESK_PUBLIC_ORIGIN;
    process.env.ULIXDESK_PUBLIC_ORIGIN = "https://reports.example";
    expect(activityFooterHost()).toBe("reports.example");
    if (previous === undefined) delete process.env.ULIXDESK_PUBLIC_ORIGIN;
    else process.env.ULIXDESK_PUBLIC_ORIGIN = previous;
  });

  it("groups by client, date, and member, and totals each level", () => {
    const model = buildTimeActivityModel({
      from: "2026-09-28",
      to: "2026-10-04",
      showMoney: true,
      groupBy: "client",
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
          todoId: "cltodoada",
          todoTitle: "Homepage",
          edited: true,
        }),
      ],
    });

    expect(model.dateRange).toBe("Mon, Sep 28, 2026 - Sun, Oct 4, 2026");
    expect(model.organization).toBe("Ulix Digital");
    expect(model.sections.map((section) => section.name)).toEqual(["Acme", "Zebra"]);
    const acme = model.sections[0];
    expect(acme?.groups.map((group) => `${group.dateLabel}|${group.memberName}|${group.showDate}`)).toEqual([
      "Mon, Sep 28, 2026|Ada Owner|true",
      "Mon, Sep 28, 2026|Sam Rivera|false",
      "Tue, Sep 29, 2026|Jordan Blake-Alexander|true",
    ]);
    expect(acme?.groups.map((group) => group.shade)).toEqual([false, true, false]);
    const sam = acme?.groups[1];
    expect(sam?.time).toBe("1:01:00");
    expect(sam?.billable).toBe("0:01:00");
    expect(sam?.billed).toBe("$1.00");
    expect(sam?.details.map((detail) => detail.todo)).toEqual([reportCopy.noTodo, "Website"]);
    expect(sam?.details[0]).toMatchObject({ missingTodo: true, notes: "", todo: reportCopy.noTodo });
    expect(sam?.details[1]?.notes).toBe("  keep spaces  ");
    expect(acme?.groups[2]?.details[0]?.notes).toBe("Called the client");
    expect(acme?.groups[0]?.details[0]?.notes).toBe("");
    expect(acme?.groups[0]?.details[0]?.todo).toBe("Homepage");
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
    expect(model.sections[0]?.groups.map((group) => group.time)).toEqual(["0:30:00", "1:30:00"]);
    expect(model.grand.time).toBe("2:00:00");
    expect(model.grand.billed).toBe("$200.00");
  });

  it("keeps each client's group subtotals when the date and member match", async () => {
    const model = buildTimeActivityModel({
      from: "2026-09-28",
      to: "2026-10-04",
      showMoney: true,
      groupBy: "client",
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
    expect(model.sections[0]?.groups[0]?.time).toBe("1:00:00");
    expect(model.sections[0]?.groups[0]?.billed).toBe("$10.00");
    expect(model.sections[1]?.groups[0]?.time).toBe("2:00:00");
    expect(model.sections[1]?.groups[0]?.billed).toBe("$40.00");
    expect(model.sections[0]?.groups[0]?.id).not.toBe(model.sections[1]?.groups[0]?.id);

    const trace: ActivityPdfRun[] = [];
    const pdf = await renderTimeActivityPdf({
      model,
      appUrl: "https://desk.example",
      compress: false,
      trace,
    });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const joined = trace.map((run) => run.text).join("\n");
    const brightpath = joined.slice(joined.indexOf("Brightpath"));
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
    expect(model.sections[0]?.billed).toBe("");
    expect(model.sections[0]?.groups[0]?.billed).toBe("");
    expect(model.grand.time).toBe("0:05:22");
  });

  it("flows a long group onto the next page without a repeated header", () => {
    const pages = paginateActivity({
      firstRoom: 120,
      nextRoom: 120,
      sections: [
        {
          sectionId: "acme",
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
    expect(kinds(pages[1])).toEqual(["detail", "total"]);
    expect(pages[1]?.some((slice) => slice.type === "heading" || slice.type === "columns")).toBe(false);
  });

  it("continues the next group on the following page", () => {
    const pages = paginateActivity({
      firstRoom: 90,
      nextRoom: 200,
      sections: [
        {
          sectionId: "acme",
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
    expect(kinds(pages[0])).toEqual(["heading", "columns", "group", "detail", "group"]);
    expect(pages[0]?.find((slice) => slice.type === "group")?.id).toBe("g1");
    expect(kinds(pages[1])).toEqual(["detail", "total"]);
    expect(pages[1]?.find((slice) => slice.type === "detail")?.id).toBe("d2");
  });

  it("draws the reference header, totals, hierarchy, and a continuation page", async () => {
    const lines: ActivityLine[] = [];
    for (let index = 0; index < 28; index += 1) {
      lines.push(
        line({
          clientName: index % 2 === 0 ? "Acme" : "Brightpath",
          date: `2026-09-${String(28 + (index % 5)).padStart(2, "0")}`,
          memberName: index % 3 === 0 ? "Jordan Blake-Alexander" : "Sam Rivera",
          projectName: index === 3 ? "" : `Task ${index}`,
          todoId: index === 4 ? "19218383" : undefined,
          todoTitle: index === 4 ? "Wp maintenance" : undefined,
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
      groupBy: "client",
      timeZone: "Asia/Colombo",
      filterSummary: "Client: Acme · Billable: Billable",
    });
    const trace: ActivityPdfRun[] = [];
    const pdf = await renderTimeActivityPdf({
      model,
      appUrl: "https://desk.example/reports",
      compress: false,
      trace,
    });
    const text = trace.map((run) => run.text).join("\n");
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(text).toContain("Time & Activity Report");
    expect(text).toContain("Ulix Digital");
    expect(text).toContain("Mon, Sep 28, 2026 - Sun, Oct 4, 2026");
    expect(text).toContain("Grand total");
    expect(text).not.toContain("To-do ID");
    expect(text).not.toContain("19218383");
    expect(text).toContain("Wp maintenance");
    expect(text).toContain("Acme");
    expect(text).toContain("Brightpath");
    expect(text.indexOf("Acme")).toBeLessThan(text.indexOf("Brightpath"));
    expect(text).toContain("(No to-do)");
    expect(text).toContain("Called the client");
    expect(text).not.toContain("Manually added");
    expect(text).not.toContain("Edited");
    expect(text).toContain("Total");
    expect(text).toContain("$");
    expect(text).toContain("Generated with UlixDesk");
    expect(text).toContain("desk.example");
    expect(text).not.toContain("https://desk.example");
    expect(text).not.toContain("Page 1 of");
    expect(text).not.toContain("Client: Acme · Billable: Billable");
    expect(text).not.toContain("Asia/Colombo");
    expect(text).not.toContain("(continued)");
    expect(text.split("To-dos").length - 1).toBeGreaterThan(1);
    expect(pdfPageCount(pdf)).toBeGreaterThan(1);
    const title = trace.find((run) => run.text === "Time & Activity Report");
    expect(title).toMatchObject({ font: "bold", size: 12, color: "#000000" });
    const link = trace.find((run) => run.text === "desk.example");
    expect(link).toMatchObject({ color: "#0000ee" });

    const summary = trace.filter((run) => run.text === "0:05:22" && run.font === "bold");
    const detail = trace.filter((run) => run.text === "0:05:22" && run.font === "regular");
    expect(summary.length).toBeGreaterThan(0);
    expect(detail.length).toBeGreaterThan(0);

    const member = buildTimeActivityModel({
      lines: [line()],
      from: "2026-09-28",
      to: "2026-10-04",
      showMoney: false,
    });
    const memberTrace: ActivityPdfRun[] = [];
    await renderTimeActivityPdf({
      model: member,
      appUrl: "https://desk.example",
      compress: false,
      trace: memberTrace,
    });
    const memberText = memberTrace.map((run) => run.text).join("\n");
    expect(memberText).not.toMatch(/\$|Billed|USD/);
    expect(memberText).toContain("0:05:22");
    expect(memberText).toContain("Billable Time");
    expect(memberText).not.toContain("To-do ID");
    expect(memberText).toContain("To-dos");
  });

  it("leaves the date blank on the second member of the same day", async () => {
    const model = buildTimeActivityModel({
      from: "2026-10-12",
      to: "2026-10-18",
      showMoney: true,
      lines: [
        line({
          date: "2026-10-12",
          projectName: "Astro Glass",
          projectId: "astro",
          memberName: "Induwara Piyumal",
          todoId: "19225777",
          todoTitle: "Wp maintenance",
        }),
        line({
          date: "2026-10-12",
          projectName: "Astro Glass",
          projectId: "astro",
          memberName: "Ulix Deves Developers",
          todoId: "18101845",
          todoTitle: "Publishing blogs",
        }),
      ],
    });
    expect(model.sections[0]?.groups[1]?.showDate).toBe(false);
    const trace: ActivityPdfRun[] = [];
    await renderTimeActivityPdf({ model, appUrl: "", compress: false, trace });
    const dates = trace.filter((run) => run.text === "Mon, Oct 12, 2026");
    expect(dates).toHaveLength(1);
    expect(trace.some((run) => run.text === "Ulix Deves Developers" && run.font === "regular")).toBe(true);
    expect(trace.some((run) => run.text === "0:05:22" && run.font === "bold")).toBe(true);
    expect(trace.some((run) => run.text === "0:05:22" && run.font === "regular")).toBe(true);
    expect(trace.some((run) => run.text === ACTIVITY_REPORT_HOST)).toBe(true);
  });

  it("sorts project sections by the report sort", () => {
    const model = buildTimeActivityModel({
      from: "2026-10-12",
      to: "2026-10-18",
      showMoney: true,
      sort: { key: "time", direction: "desc", currency: null },
      lines: [
        line({ projectName: "Short", projectId: "short", durationMs: 60_000, billableMs: 60_000 }),
        line({
          projectName: "Long",
          projectId: "long",
          durationMs: 2 * 60 * 60 * 1000,
          billableMs: 2 * 60 * 60 * 1000,
        }),
      ],
    });
    expect(model.sections.map((section) => section.name)).toEqual(["Long", "Short"]);
  });

  it("marks unrated time, leaves non-billable blank, and keeps each currency", () => {
    const model = buildTimeActivityModel({
      from: "2026-09-28",
      to: "2026-10-04",
      showMoney: true,
      groupBy: "client",
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

    const acme = model.sections[0];
    const unrated = acme?.groups[0]?.details.find((detail) => detail.todo === "Website");
    const internal = acme?.groups[0]?.details.find((detail) => detail.todo === "Internal");
    const zero = acme?.groups[0]?.details.find((detail) => detail.todo === "Zero");
    expect(unrated?.billed).toBe(activityNoAmount);
    expect(internal?.billed).toBe("");
    expect(zero?.billed).toBe("$0.00");
    expect(acme?.groups[0]?.billed).toBe(`$0.00\n${activityNoAmount}`);
    expect(acme?.billed).toBe(`$0.00\n${activityNoAmount}`);
    expect(acme?.billed).not.toContain("$0.00,");

    const yen = model.sections[1];
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
    const notes = model.sections[0]?.groups[0]?.details[0]?.notes ?? "";
    expect(notes.startsWith("Start n")).toBe(true);
    expect(notes.endsWith("…")).toBe(true);
    expect(notes.length).toBeLessThanOrEqual(ACTIVITY_NOTES_MAX + 1);
    expect(notes).not.toContain("end");
  });

  it("matches the reference week totals and hierarchy", async () => {
    const model = buildTimeActivityModel({
      lines: referenceActivityLines(),
      from: "2026-10-12",
      to: "2026-10-18",
      showMoney: true,
      organization: "Ulix Digital",
    });
    expect(model.dateRange).toBe("Mon, Oct 12, 2026 - Sun, Oct 18, 2026");
    expect(model.grand.time).toBe("27:32:37");
    expect(model.grand.billable).toBe("27:32:37");
    expect(model.grand.billed).toBe("$688.61");
    expect(model.sections.map((section) => section.name)[0]).toBe("Accessories Unlimited");
    const astro = model.sections.find((section) => section.name === "Astro Glass");
    expect(astro?.groups.map((group) => `${group.memberName}|${group.showDate}`)).toEqual([
      "Induwara Piyumal|true",
      "Ulix Deves Developers|false",
    ]);
    expect(astro?.time).toBe("1:03:33");
    const palms = model.sections.find((section) => section.name === "Palms Trading");
    expect(palms?.groups[0]?.showDate).toBe(true);
    expect(palms?.groups[1]?.showDate).toBe(false);
    expect(palms?.groups[1]?.memberName).toBe("Yashmi Hewa Pinnapola");
    const wsi = model.sections.find((section) => section.name === "WSI Web Enhancers");
    const manual = wsi?.groups.find((group) => group.memberName === "Anupa Kaluarachchi");
    expect(manual?.details[0]).toMatchObject({
      todo: "Meetings, Minor Tasks, Emails, & QA",
      notes: "",
      time: "10:00:00",
      billed: "$250.00",
    });
    expect(wsi?.time).toBe("10:18:32");

    const trace: ActivityPdfRun[] = [];
    const pdf = await renderTimeActivityPdf({ model, appUrl: "", compress: false, trace });
    expect(pdfPageCount(pdf)).toBeGreaterThan(1);
    const text = trace.map((run) => run.text).join("\n");
    expect(text).not.toContain("To-do ID");
    expect(text).not.toContain("19218383");
    expect(text).not.toContain("14465394");
    expect(text).toContain("To-dos");
    expect(text).not.toContain("Manually added");
    expect(text).not.toContain("Edited");
    const header = trace.filter((run) => run.text === "Date" || run.text === "Member" || run.text === "To-dos" || run.text === "Time" || run.text === "Billed amount" || run.text === "Billable time" || run.text === "Notes");
    const firstHeaderY = header.find((run) => run.text === "Date")?.y;
    const firstRow = header.filter((run) => run.y === firstHeaderY).sort((a, b) => a.x - b.x);
    expect(firstRow.map((run) => run.text)).toEqual([
      "Date",
      "Member",
      "To-dos",
      "Time",
      "Billed amount",
      "Billable time",
      "Notes",
    ]);
    const todosX = firstRow.find((run) => run.text === "To-dos")?.x ?? 0;
    const notesX = firstRow.find((run) => run.text === "Notes")?.x ?? 0;
    const timeX = firstRow.find((run) => run.text === "Time")?.x ?? 0;
    // To-dos absorbed 66pt of the removed To-do ID column (198pt wide).
    expect(timeX - todosX).toBeGreaterThan(180);
    // Notes starts earlier than it did beside a 133pt To-do ID column, so the remainder is wider.
    expect(notesX).toBeLessThan(600);
    expect(text).toContain("Generated with UlixDesk");
    expect(text).not.toContain("(continued)");
    const boldTime = trace.filter((run) => run.text === "0:10:22" && run.font === "bold");
    const regularTime = trace.filter((run) => run.text === "0:10:22" && run.font === "regular");
    expect(boldTime.length).toBeGreaterThan(0);
    expect(regularTime.length).toBeGreaterThan(0);

    if (process.env.ULIXDESK_WRITE_SAMPLE_PDF === "1") {
      const dir = "/opt/cursor/artifacts";
      mkdirSync(dir, { recursive: true });
      const pdfPath = `${dir}/time-activity-sample.pdf`;
      writeFileSync(pdfPath, pdf);
      execFileSync("pdftoppm", [
        "-png",
        "-r",
        "150",
        "-f",
        "1",
        "-l",
        "1",
        "-singlefile",
        pdfPath,
        `${dir}/ta-pdf-no-manual-note-page-1`,
      ]);
    }
  });
});

function kinds(page: ActivitySlice[] | undefined) {
  return page?.map((slice) => slice.type);
}

function pdfPageCount(buffer: Buffer) {
  const match = buffer.toString("latin1").match(/\/Type\s*\/Pages\b[\s\S]{0,200}?\/Count\s+(\d+)/);
  return match ? Number(match[1]) : 0;
}
