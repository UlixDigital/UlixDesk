import { requireUser } from "@/lib/auth";
import { reportCodes, reportCopy } from "@/lib/report-copy";
import { isReportKind, reportTitle } from "@/lib/report-query";
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
  const filename = `${reportTitle(report)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")}.csv`;
  return new Response(reportToCsv(prepared.report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
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
