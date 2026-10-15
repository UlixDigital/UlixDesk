import type { Metadata } from "next";
import Link from "next/link";
import { budgetCopy, budgetNoAmount } from "@/lib/budget-copy";
import { listBudgetReport, parseBudgetReportFilters } from "@/lib/budgets";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canSeeMoney } from "@/lib/users-validation";
import { ui } from "@/lib/ui";

export const metadata: Metadata = {
  title: budgetCopy.reportTitle,
};

type Search = Record<string, string | string[] | undefined>;

export default async function BudgetsReportPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const actor = await getCurrentUser();
  if (!actor) return null;
  const params = await searchParams;
  const filters = parseBudgetReportFilters(params);
  const showMoney = canSeeMoney(actor.role);
  const [report, clients, projects] = await Promise.all([
    listBudgetReport({ actor, filters }),
    showMoney
      ? prisma.client.findMany({
          select: { id: true, name: true, archivedAt: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.project.findMany({
      select: { id: true, name: true, archivedAt: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const query = filterQuery(filters);
  const exportHref = query ? `/reports/budgets/export?${query}` : "/reports/budgets/export";
  const filtered = Boolean(filters.clientId || filters.projectId || filters.includeArchived || filters.kind !== "all");

  return (
    <div className="min-w-0">
      <p className="text-sm text-slate-500">
        <Link href="/reports" className="hover:text-accent">
          Reports
        </Link>
      </p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{budgetCopy.reportTitle}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {showMoney ? budgetCopy.reportBody : budgetCopy.reportMemberBody}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">{budgetCopy.reportIntro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={exportHref} className={ui.secondaryButton}>
            {budgetCopy.exportCsv}
          </a>
          <a href={`${exportHref}${query ? "&" : "?"}format=pdf`} className={ui.secondaryButton}>
            {budgetCopy.exportPdf}
          </a>
        </div>
      </div>
      <form action="/reports/budgets" method="get" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {showMoney ? (
          <label className="block text-sm font-medium text-slate-800">
            Client
            <select name="client" defaultValue={filters.clientId} className={`${ui.input} mt-1.5`}>
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                  {client.archivedAt ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block text-sm font-medium text-slate-800">
          Project
          <select name="project" defaultValue={filters.projectId} className={`${ui.input} mt-1.5`}>
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {project.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        {showMoney ? (
          <label className="block text-sm font-medium text-slate-800">
            {budgetCopy.kindLabel}
            <select name="kind" defaultValue={filters.kind} className={`${ui.input} mt-1.5`}>
              <option value="all">{budgetCopy.kindAll}</option>
              <option value="projects">{budgetCopy.kindProjects}</option>
              <option value="clients">{budgetCopy.kindClients}</option>
            </select>
          </label>
        ) : null}
        <label className="flex items-end gap-2 pb-2 text-sm text-slate-800">
          <input
            type="checkbox"
            name="archived"
            value="include"
            defaultChecked={filters.includeArchived}
          />
          {budgetCopy.includeArchived}
        </label>
        <div className="flex items-end">
          <button type="submit" className={ui.secondaryButton}>
            Apply
          </button>
        </div>
      </form>
      <p className="mt-3 text-xs text-slate-500">
        {budgetCopy.timezoneLabel}: {report.timeZone}
      </p>
      {report.rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">{filtered ? budgetCopy.emptyFiltered : budgetCopy.empty}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-3 py-2">{budgetCopy.colName}</th>
                {showMoney ? <th className="px-3 py-2">{budgetCopy.colType}</th> : null}
                <th className="px-3 py-2">{budgetCopy.colPeriod}</th>
                <th className="px-3 py-2 text-right">{budgetCopy.colBudget}</th>
                <th className="px-3 py-2 text-right">{budgetCopy.colUsed}</th>
                <th className="px-3 py-2 text-right">{budgetCopy.colRemaining}</th>
                <th className="px-3 py-2 text-right">{budgetCopy.colPercent}</th>
                <th className="px-3 py-2">{budgetCopy.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="px-3 py-2 font-medium text-ink">
                    {row.name}
                    {row.archived ? <span className="ml-2 text-xs font-normal text-slate-500">Archived</span> : null}
                  </th>
                  {showMoney ? <td className="px-3 py-2 text-slate-700">{row.typeLabel}</td> : null}
                  <td className="px-3 py-2 text-slate-700">{row.periodLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.figures.budgetLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.figures.usedLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.figures.remainingLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.figures.percentLabel}</td>
                  <td className="px-3 py-2">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showMoney && report.rows.some((row) => row.figures.usedLabel.includes(budgetNoAmount)) ? (
        <p className="mt-3 text-xs text-slate-500">{budgetCopy.unratedNote}</p>
      ) : null}
    </div>
  );
}

function filterQuery(filters: ReturnType<typeof parseBudgetReportFilters>) {
  const params = new URLSearchParams();
  if (filters.clientId) params.set("client", filters.clientId);
  if (filters.projectId) params.set("project", filters.projectId);
  if (filters.includeArchived) params.set("archived", "include");
  if (filters.kind !== "all") params.set("kind", filters.kind);
  return params.toString();
}
