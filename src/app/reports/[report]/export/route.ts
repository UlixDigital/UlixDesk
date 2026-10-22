import { requireUser } from "@/lib/auth";
import { reportCodes, reportCopy } from "@/lib/report-copy";
import { builtReportToTable, renderReportPdf } from "@/lib/report-pdf";
import {
  activitySortLabel,
  describeReportFilters,
  isReportKind,
  reportTitle,
} from "@/lib/report-query";
import { prepareReport } from "@/lib/report-request";
import { reportToCsv } from "@/lib/reports";

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
  if (url.searchParams.get("format") === "pdf") {
    const member = prepared.people.find((person) => person.id === prepared.query.memberId) ?? null;
    const client = prepared.clients.find((item) => item.id === prepared.query.clientId) ?? null;
    const project = prepared.projects.find((item) => item.id === prepared.query.projectId) ?? null;
    const todo = prepared.todos.find((item) => item.id === prepared.query.todoId) ?? null;
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
        todoName: todo?.name ?? null,
        billable: prepared.query.billable,
        groupBy: prepared.query.groupBy,
        groupBy2: report === "time-activity" ? prepared.query.groupBy2 : null,
        sortLabel: report === "time-activity" ? activitySortLabel(prepared.query.sort) : null,
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
