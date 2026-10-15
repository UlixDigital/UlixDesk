import { requireUser } from "@/lib/auth";
import { budgetCopy } from "@/lib/budget-copy";
import { budgetReportCsv, budgetReportTable } from "@/lib/budget-report";
import { listBudgetReport, parseBudgetReportFilters } from "@/lib/budgets";
import { prisma } from "@/lib/db";
import { renderReportPdf } from "@/lib/report-pdf";
import { canSeeMoney } from "@/lib/users-validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requireUser();
  const url = new URL(request.url);
  const params: Record<string, string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    params[key] = url.searchParams.getAll(key);
  }
  const filters = parseBudgetReportFilters(params);
  const report = await listBudgetReport({ actor, filters });
  if (url.searchParams.get("format") === "pdf") {
    const showMoney = canSeeMoney(actor.role);
    const [client, project] = await Promise.all([
      filters.clientId
        ? prisma.client.findUnique({ where: { id: filters.clientId }, select: { name: true } })
        : Promise.resolve(null),
      filters.projectId
        ? prisma.project.findUnique({ where: { id: filters.projectId }, select: { name: true } })
        : Promise.resolve(null),
    ]);
    const kind =
      filters.kind === "projects"
        ? budgetCopy.kindProjects
        : filters.kind === "clients"
          ? budgetCopy.kindClients
          : budgetCopy.kindAll;
    const pdf = await renderReportPdf({
      title: budgetCopy.reportTitle,
      filters: [
        ...(showMoney ? [`Client: ${client?.name ?? "All clients"}`] : []),
        `Project: ${project?.name ?? "All projects"}`,
        ...(showMoney ? [`${budgetCopy.kindLabel}: ${kind}`] : []),
        `${budgetCopy.includeArchived}: ${filters.includeArchived ? "Yes" : "No"}`,
        `${budgetCopy.timezoneLabel}: ${report.timeZone}`,
        budgetCopy.reportIntro,
      ],
      table: budgetReportTable(report.rows, report.showMoney),
      empty: budgetCopy.empty,
    });
    return file(new Uint8Array(pdf), "application/pdf", "budgets.pdf");
  }
  return file(budgetReportCsv(report.rows, report.showMoney), "text/csv; charset=utf-8", "budgets.csv");
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
