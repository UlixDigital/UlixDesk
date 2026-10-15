import type { Metadata } from "next";
import Link from "next/link";
import { SavedReportList, type SavedReportListItem } from "@/components/saved-report-list";
import { getWorkspaceTimeZone } from "@/lib/bill-rates";
import { budgetCopy } from "@/lib/budget-copy";
import { invoiceReportCopy } from "@/lib/invoice-report-copy";
import { reportCopy, savedReportErrorText, savedReportNotice } from "@/lib/report-copy";
import { reportDescription, reportKinds, reportTitle } from "@/lib/report-query";
import {
  canChangeSavedReport,
  isSavedReportType,
  listVisibleSavedReports,
  parseStoredReportParams,
  savedReportHref,
  savedReportTitle,
  scopeStoredParams,
} from "@/lib/saved-reports";
import { firstSearchParam } from "@/lib/search-params";
import { getCurrentUser } from "@/lib/session";
import { timeChangeCopy } from "@/lib/time-change-copy";
import { todayInTimeZone } from "@/lib/time-zone";
import { canManageWorkspace } from "@/lib/users-validation";

export const metadata: Metadata = {
  title: reportCopy.pageTitle,
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentUser();
  if (!actor) return null;
  const manager = canManageWorkspace(actor.role);
  const params = await searchParams;
  const notice = savedReportNotice(firstSearchParam(params.notice));
  const error = savedReportErrorText(firstSearchParam(params.error));
  const cards = [
    ...reportKinds.map((kind) => ({
      href: `/reports/${kind}`,
      title: reportTitle(kind),
      body: reportDescription(kind, manager),
    })),
    {
      href: "/reports/manual-time-edits",
      title: timeChangeCopy.pageTitle,
      body: reportCopy.timeEditsBody,
    },
    {
      href: "/reports/budgets",
      title: budgetCopy.reportTitle,
      body: manager ? budgetCopy.reportBody : budgetCopy.reportMemberBody,
    },
    ...(manager
      ? [
          {
            href: "/reports/client-invoices",
            title: invoiceReportCopy.clientTitle,
            body: invoiceReportCopy.clientBody,
          },
          {
            href: "/reports/invoice-aging",
            title: invoiceReportCopy.agingTitle,
            body: invoiceReportCopy.agingBody,
          },
        ]
      : []),
  ];
  const today = todayInTimeZone(await getWorkspaceTimeZone());
  const saved = await listVisibleSavedReports(actor);
  const items: SavedReportListItem[] = saved.map((row) => {
    const savedBy = row.createdById === actor.id ? null : row.createdByName;
    const canChange = canChangeSavedReport(actor, row);
    if (!isSavedReportType(row.reportType)) {
      return {
        id: row.id,
        name: row.name,
        reportTitle: reportCopy.savedUnavailable,
        visibility: row.visibility,
        href: null,
        savedBy,
        canChange,
      };
    }
    const parsed = parseStoredReportParams(row.reportType, row.params, today);
    const href = parsed.ok
      ? savedReportHref(parsed.reportType, scopeStoredParams(actor, parsed.reportType, parsed.params), {
          includeMember: manager,
        })
      : null;
    return {
      id: row.id,
      name: row.name,
      reportTitle: savedReportTitle(row.reportType),
      visibility: row.visibility,
      href,
      savedBy,
      canChange,
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{reportCopy.pageTitle}</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        {manager ? reportCopy.allScope : reportCopy.ownScope} {reportCopy.intro}
      </p>
      {notice ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          data-error-code={firstSearchParam(params.error)}
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="block h-full rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] hover:border-primary-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <h2 className="text-base font-semibold text-ink">{card.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{card.body}</p>
            </Link>
          </li>
        ))}
      </ul>
      <section aria-labelledby="saved-reports-heading" className="mt-8">
        <h2 id="saved-reports-heading" className="text-lg font-semibold text-ink">
          {reportCopy.savedTitle}
        </h2>
        <SavedReportList items={items} />
      </section>
    </div>
  );
}
