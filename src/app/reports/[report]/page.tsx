import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportColumns } from "@/components/report-columns";
import { ReportFilters } from "@/components/report-filters";
import { ReportTable } from "@/components/report-table";
import { SaveReportDialog } from "@/components/save-report-dialog";
import { reportCodes, reportCopy } from "@/lib/report-copy";
import {
  allowedColumns,
  isReportKind,
  reportDescription,
  reportHref,
  reportTitle,
} from "@/lib/report-query";
import { prepareReport } from "@/lib/report-request";
import { getCurrentUser } from "@/lib/session";
import { ui } from "@/lib/ui";

type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ report: string }>;
}): Promise<Metadata> {
  const { report } = await params;
  if (!isReportKind(report)) return { title: reportCopy.pageTitle };
  return { title: reportTitle(report) };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<Search>;
}) {
  const { report } = await params;
  if (!isReportKind(report)) notFound();
  const actor = await getCurrentUser();
  if (!actor) return null;
  const prepared = await prepareReport({
    actor,
    kind: report,
    params: await searchParams,
  });

  return (
    <div className="min-w-0">
      <p className="text-sm text-slate-500">
        <Link href="/reports" className="hover:text-accent">
          {reportCopy.pageTitle}
        </Link>
      </p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{reportTitle(report)}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {prepared.manager ? reportCopy.allScope : reportCopy.ownScope}{" "}
            {reportDescription(report, prepared.manager)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={reportHref(report, prepared.query, { exportCsv: true })} className={ui.secondaryButton}>
            {reportCopy.exportCsv}
          </a>
          <a href={reportHref(report, prepared.query, { exportPdf: true })} className={ui.secondaryButton}>
            {reportCopy.exportPdf}
          </a>
          <SaveReportDialog
            canShare={prepared.manager}
            fields={{
              reportType: report,
              preset: prepared.query.preset,
              from: prepared.query.from,
              to: prepared.query.to,
              member: prepared.query.memberId,
              client: prepared.query.clientId,
              project: prepared.query.projectId,
              billable: prepared.query.billable,
              group: prepared.query.groupBy,
              columns: prepared.columns.join(","),
            }}
          />
        </div>
      </div>
      <ReportFilters
        kind={report}
        preset={prepared.query.preset}
        from={prepared.query.from}
        to={prepared.query.to}
        memberId={prepared.query.memberId}
        clientId={prepared.query.clientId}
        projectId={prepared.query.projectId}
        billable={prepared.query.billable}
        groupBy={prepared.query.groupBy}
        columns={prepared.columnsInUrl ? prepared.columns : null}
        filtered={prepared.filtered}
        projects={prepared.projects.map((item) => ({
          id: item.id,
          name: item.name,
          archived: item.archivedAt !== null,
        }))}
        clients={prepared.clients.map((item) => ({
          id: item.id,
          name: item.name,
          archived: item.archivedAt !== null,
        }))}
        people={prepared.people.map((person) => ({ id: person.id, name: person.name }))}
      />
      <ReportColumns
        kind={report}
        baseHref={reportHref(report, { ...prepared.query, columns: null, page: 1 })}
        columns={prepared.columns}
        columnsInUrl={prepared.columnsInUrl}
        choices={allowedColumns(report, prepared.showMoney, prepared.manager)}
      />
      <p className="mt-3 text-sm text-slate-500">
        {report === "time-activity" ? reportCopy.activityExportAll : reportCopy.exportAll}
      </p>
      {prepared.failure === "range" ? (
        <p
          role="alert"
          data-error-code={reportCodes.REPORT_RANGE_ORDER}
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {reportCopy.rangeOrder}
        </p>
      ) : null}
      {prepared.failure === "large" ? (
        <p
          role="alert"
          data-error-code={reportCodes.REPORT_TOO_LARGE}
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {reportCopy.tooLarge}
        </p>
      ) : null}
      {prepared.report ? (
        <ReportTable
          kind={report}
          query={prepared.query}
          report={prepared.report}
          filtered={prepared.filtered}
        />
      ) : null}
    </div>
  );
}
