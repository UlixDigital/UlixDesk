import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceReportFilters } from "@/components/invoice-report-filters";
import { PermissionNote } from "@/components/permission-note";
import { SaveReportDialog } from "@/components/save-report-dialog";
import { getWorkspaceTimeZone } from "@/lib/bill-rates";
import { prisma } from "@/lib/db";
import { invoiceCopy, invoiceStatusLabel } from "@/lib/invoice-copy";
import { invoiceReportCopy } from "@/lib/invoice-report-copy";
import { invoiceReportSearch, loadClientInvoiceReport } from "@/lib/invoice-reports";
import { formatMoney } from "@/lib/money";
import { reportCodes, reportCopy } from "@/lib/report-copy";
import { getCurrentUser } from "@/lib/session";
import { todayInTimeZone } from "@/lib/time-zone";
import { ui } from "@/lib/ui";
import { canManageWorkspace } from "@/lib/users-validation";

export const metadata: Metadata = { title: invoiceReportCopy.clientTitle };

type Search = Record<string, string | string[] | undefined>;

export default async function ClientInvoicesReportPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await getCurrentUser();
  if (!actor) return null;
  if (!canManageWorkspace(actor.role)) return <PermissionNote message={invoiceReportCopy.denied} />;
  const today = todayInTimeZone(await getWorkspaceTimeZone());
  const params = await searchParams;
  const report = await loadClientInvoiceReport({ actor, params, today });
  const clients = await prisma.client.findMany({
    select: { id: true, name: true, archivedAt: true },
    orderBy: { name: "asc" },
  });
  const filters = report.ok ? report.filters : "filters" in report ? report.filters : null;
  const preset = filters?.preset ?? "this-month";
  const from = filters?.from ?? today;
  const to = filters?.to ?? today;
  const clientId = filters?.clientId ?? "";
  const status = filters?.status ?? "all";
  const query = invoiceReportSearch({ preset, from, to, clientId, status });
  const exportHref = query ? `/reports/client-invoices/export?${query}` : "/reports/client-invoices/export";
  const timeZone = await getWorkspaceTimeZone();

  return (
    <div className="min-w-0" id="client-invoices-report">
      <p className="text-sm text-slate-500">
        <Link href="/reports" className="hover:text-accent">
          {reportCopy.pageTitle}
        </Link>
      </p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{invoiceReportCopy.clientTitle}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{invoiceReportCopy.clientBody}</p>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            {invoiceReportCopy.excluded} {reportCopy.timezoneLabel}: {timeZone}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={exportHref} className={ui.secondaryButton}>
            {reportCopy.exportCsv}
          </a>
          <a href={`${exportHref}${query ? "&" : "?"}format=pdf`} className={ui.secondaryButton}>
            {reportCopy.exportPdf}
          </a>
          <SaveReportDialog
            canShare
            fields={{
              reportType: "client-invoices",
              preset,
              from,
              to,
              client: clientId,
              status,
            }}
          />
        </div>
      </div>
      <InvoiceReportFilters
        action="/reports/client-invoices"
        preset={preset}
        from={from}
        to={to}
        clientId={clientId}
        status={status}
        filtered={report.ok ? report.filtered : Boolean(clientId || status !== "all")}
        clients={clients.map((client) => ({ id: client.id, name: client.name, archived: client.archivedAt !== null }))}
      />
      <p className="mt-3 text-sm text-slate-500">{reportCopy.pdfMatches} {reportCopy.exportAll}</p>
      {!report.ok && report.failure === "range" ? (
        <p role="alert" data-error-code={reportCodes.REPORT_RANGE_ORDER} className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {reportCopy.rangeOrder}
        </p>
      ) : null}
      {!report.ok && report.failure === "large" ? (
        <p role="alert" data-error-code={reportCodes.REPORT_TOO_LARGE} className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {invoiceReportCopy.tooLarge}
        </p>
      ) : null}
      {report.ok ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">{invoiceReportCopy.issueDate}</th>
                <th className="px-3 py-2 font-medium">{invoiceReportCopy.number}</th>
                <th className="px-3 py-2 font-medium">{invoiceCopy.client}</th>
                <th className="px-3 py-2 font-medium">{invoiceCopy.status}</th>
                <th className="px-3 py-2 text-right font-medium">{invoiceCopy.total}</th>
                <th className="px-3 py-2 text-right font-medium">{invoiceCopy.paid}</th>
                <th className="px-3 py-2 text-right font-medium">{invoiceCopy.amountDue}</th>
                <th className="px-3 py-2 font-medium">{invoiceReportCopy.dueDate}</th>
                <th className="px-3 py-2 font-medium">{invoiceReportCopy.overdue}</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-slate-600">
                    {report.filtered ? invoiceReportCopy.emptyFiltered : invoiceReportCopy.empty}
                  </td>
                </tr>
              ) : (
                report.rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200">
                    <td className="px-3 py-2 whitespace-nowrap">{row.issueDate}</td>
                    <td className="px-3 py-2">
                      <Link href={`/invoices/${row.id}`} className="font-medium text-accent hover:underline">
                        {row.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{row.clientName}</td>
                    <td className="px-3 py-2">{invoiceStatusLabel(row.status)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatMoney(row.totalMinor, row.currency)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatMoney(row.paidMinor, row.currency)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatMoney(row.dueMinor, row.currency)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.dueDate}</td>
                    <td className="px-3 py-2">{row.overdue ? invoiceReportCopy.overdueYes : invoiceReportCopy.overdueNo}</td>
                  </tr>
                ))
              )}
              {report.totals.map((total) => (
                <tr key={total.currency} className="border-t border-slate-300 bg-slate-50 font-semibold">
                  <td className="px-3 py-2" colSpan={4}>
                    {reportCopy.total} ({total.currency})
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatMoney(total.totalMinor, total.currency)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatMoney(total.paidMinor, total.currency)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatMoney(total.dueMinor, total.currency)}</td>
                  <td className="px-3 py-2" colSpan={2} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
