import { publicOrigin, requireUser } from "@/lib/auth";
import { reportCodes, reportCopy } from "@/lib/report-copy";
import { builtReportToTable, renderReportPdf } from "@/lib/report-pdf";
import {
  describeActivityFilters,
  describeReportFilters,
  isReportKind,
  reportTitle,
} from "@/lib/report-query";
import { prepareReport } from "@/lib/report-request";
import { reportToCsv, slicesForEntry } from "@/lib/reports";
import {
  buildTimeActivityModel,
  renderTimeActivityPdf,
  type ActivityLine,
} from "@/lib/time-activity-pdf";
import { zonedDayEnd, zonedDayStart } from "@/lib/time-zone";

export async function GET(
  request: Request,
  context: { params: Promise<{ report: string }> },
) {
  const { report } = await context.params;
  if (!isReportKind(report)) {
    return text(reportCopy.pageTitle, 404, reportCodes.REPORT_NOT_FOUND);
  }
  const actor = await requireUser();
  const url = new URL(request.url);
  const params: Record<string, string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    params[key] = url.searchParams.getAll(key);
  }
  const prepared = await prepareReport({ actor, kind: report, params, allRows: true });
  if (prepared.failure === "range") return text(reportCopy.rangeOrder, 400, reportCodes.REPORT_RANGE_ORDER);
  if (prepared.failure === "large" || !prepared.report) {
    return text(reportCopy.tooLarge, 400, reportCodes.REPORT_TOO_LARGE);
  }
  const slug = reportTitle(report)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  if (url.searchParams.get("format") === "pdf" && report === "time-activity") {
    const appUrl = await publicOrigin();
    const from = prepared.query.from;
    const to = prepared.query.to;
    const rangeStart = zonedDayStart(from, prepared.timeZone);
    const rangeEnd = zonedDayEnd(to, prepared.timeZone);
    const member = prepared.manager
      ? (prepared.people.find((person) => person.id === prepared.query.memberId) ?? null)
      : null;
    const client = prepared.clients.find((item) => item.id === prepared.query.clientId) ?? null;
    const project = prepared.projects.find((item) => item.id === prepared.query.projectId) ?? null;
    const lines: ActivityLine[] = prepared.entries.flatMap((entry) =>
      slicesForEntry(entry, rangeStart, rangeEnd, prepared.timeZone).map((slice) => ({
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
    );
    const model = buildTimeActivityModel({
      lines,
      from,
      to,
      showMoney: prepared.showMoney,
      timeZone: prepared.timeZone,
      filterSummary: describeActivityFilters({
        showMember: prepared.manager,
        memberName: member?.name ?? null,
        clientName: client?.name ?? null,
        projectName: project?.name ?? null,
        billable: prepared.query.billable,
      }),
    });
    const pdf = await renderTimeActivityPdf({
      model,
      appUrl,
      empty: prepared.filtered ? reportCopy.emptyFiltered : reportCopy.empty,
    });
    return file(new Uint8Array(pdf), "application/pdf", `${slug}.pdf`);
  }
  if (url.searchParams.get("format") === "pdf") {
    const member = prepared.people.find((person) => person.id === prepared.query.memberId) ?? null;
    const client = prepared.clients.find((item) => item.id === prepared.query.clientId) ?? null;
    const project = prepared.projects.find((item) => item.id === prepared.query.projectId) ?? null;
    const pdf = await renderReportPdf({
      title: reportTitle(report),
      filters: describeReportFilters({
        kind: report,
        from: prepared.query.from,
        to: prepared.query.to,
        timeZone: prepared.timeZone,
        showMember: prepared.manager,
        memberName: member?.name ?? null,
        clientName: client?.name ?? null,
        projectName: project?.name ?? null,
        billable: prepared.query.billable,
        groupBy: prepared.query.groupBy,
      }),
      table: builtReportToTable(prepared.report),
      empty: prepared.filtered ? reportCopy.emptyFiltered : reportCopy.empty,
    });
    return file(new Uint8Array(pdf), "application/pdf", `${slug}.pdf`);
  }
  return file(reportToCsv(prepared.report), "text/csv; charset=utf-8", `${slug}.csv`);
}

function file(body: BodyInit, contentType: string, filename: string) {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function text(body: string, status: number, code: string) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Error-Code": code,
      "Cache-Control": "no-store",
    },
  });
}
