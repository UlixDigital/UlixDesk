import { requireUser } from "@/lib/auth";
import { getWorkspaceTimeZone } from "@/lib/bill-rates";
import { prisma } from "@/lib/db";
import { invoiceReportCopy } from "@/lib/invoice-report-copy";
import { agingToCsv, agingToTable, loadAgingReport } from "@/lib/invoice-reports";
import { reportCodes, reportCopy } from "@/lib/report-copy";
import { renderReportPdf } from "@/lib/report-pdf";
import { todayInTimeZone } from "@/lib/time-zone";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requireUser();
  const url = new URL(request.url);
  const params: Record<string, string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    params[key] = url.searchParams.getAll(key);
  }
  const timeZone = await getWorkspaceTimeZone();
  const today = todayInTimeZone(timeZone);
  const report = await loadAgingReport({ actor, params, today });
  if (!report.ok && report.failure === "denied") return text(invoiceReportCopy.denied, 403, "INVOICE_REPORT_DENIED");
  if (!report.ok && report.failure === "range") return text(reportCopy.rangeOrder, 400, reportCodes.REPORT_RANGE_ORDER);
  if (!report.ok) return text(invoiceReportCopy.tooLarge, 400, reportCodes.REPORT_TOO_LARGE);
  if (url.searchParams.get("format") === "pdf") {
    const client = report.filters.clientId
      ? await prisma.client.findUnique({ where: { id: report.filters.clientId }, select: { name: true } })
      : null;
    const pdf = await renderReportPdf({
      title: invoiceReportCopy.agingTitle,
      filters: [
        `${invoiceReportCopy.asOfLabel}: ${report.filters.asOf}`,
        `${reportCopy.clientLabel}: ${client?.name ?? reportCopy.allClients}`,
        `${reportCopy.timezoneLabel}: ${timeZone}`,
        invoiceReportCopy.agingExcluded,
      ],
      table: report.rows.length > 0 ? agingToTable(report.rows, report.totals) : null,
      empty: report.filtered ? invoiceReportCopy.emptyFiltered : invoiceReportCopy.agingEmpty,
    });
    return file(new Uint8Array(pdf), "application/pdf", "invoice-aging.pdf");
  }
  return file(agingToCsv(report.rows, report.totals), "text/csv; charset=utf-8", "invoice-aging.csv");
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
