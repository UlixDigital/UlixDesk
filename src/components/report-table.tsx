import Link from "next/link";
import { nextColumnSort, sortArrowColumnId } from "@/lib/activity-grouping";
import { reportCopy, showingRowsLabel } from "@/lib/report-copy";
import {
  activitySortLabel,
  defaultActivitySort,
  reportHref,
  type ReportQuery,
  type ReportKind,
} from "@/lib/report-query";
import type { BuiltReport } from "@/lib/reports";
import { cn } from "@/lib/cn";
import { ui } from "@/lib/ui";

export function ReportTable({
  kind,
  query,
  report,
  filtered,
}: {
  kind: ReportKind;
  query: ReportQuery;
  report: BuiltReport;
  filtered: boolean;
}) {
  if (report.rows.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <h2 className="text-lg font-semibold text-ink">
          {filtered ? reportCopy.emptyFiltered : reportCopy.empty}
        </h2>
      </div>
    );
  }

  const start = (report.page - 1) * report.pageSize + 1;
  const end = start + report.rows.length - 1;
  const pageHref = (page: number) => reportHref(kind, { ...query, columns: query.columns, page });
  const sortable = kind === "time-activity";
  const sort = query.sort ?? defaultActivitySort(query.groupBy);
  const arrowColumn = sortable
    ? sortArrowColumnId(report.columns, query.groupBy, query.groupBy2, sort)
    : null;

  return (
    <div className="mt-4 min-w-0 max-w-full">
      <p className="text-sm text-slate-600">{showingRowsLabel(start, end, report.totalRows)}</p>
      <div className="mt-3 w-full max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]">
        <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-slate-500">
              {report.columns.map((column) => {
                const next = sortable
                  ? nextColumnSort({
                      current: sort,
                      columnId: column.id,
                      groupBy: query.groupBy,
                      groupBy2: query.groupBy2,
                    })
                  : null;
                const active = column.id === arrowColumn;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "border-b border-slate-200 px-4 py-3 font-medium",
                      isAmountColumn(column.id) && "text-right",
                    )}
                  >
                    {next ? (
                      <Link
                        href={reportHref(kind, { ...query, sort: next, page: 1 })}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-ink",
                          isAmountColumn(column.id) && "justify-end",
                        )}
                      >
                        {column.label}
                        {active ? (
                          <span aria-hidden="true" className="text-accent">
                            {sort.direction === "asc" ? "↑" : "↓"}
                          </span>
                        ) : null}
                        <span className="sr-only">
                          {active ? `, ${activitySortLabel(sort)}` : `, ${reportCopy.sortLabel}`}
                        </span>
                      </Link>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {kind === "time-activity" && report.totals ? (
              <TotalRow columns={report.columns} totals={report.totals} edge="top" />
            ) : null}
            {report.rows.map((row) => {
              const headerId = row.depth && row.depth > 0 ? "group2" : report.columns[0]?.id;
              const subtotal = row.kind === "subtotal";
              return (
                <tr key={row.id} data-row-kind={row.kind ?? "group"}>
                  {report.columns.map((column) => {
                    const value = row.cells[column.id] ?? "";
                    const className = cn(
                      "border-b border-slate-100 px-4 py-3 align-top text-ink",
                      isAmountColumn(column.id) && "text-right tabular-nums",
                      subtotal && "bg-slate-50 font-semibold",
                      column.id === "group2" && row.depth === 1 && "pl-8",
                    );
                    if (column.id === headerId) {
                      return (
                        <th key={column.id} scope="row" className={cn(className, "text-left font-semibold")}>
                          <CellText value={value} />
                          {subtotal ? <span className="sr-only"> subtotal</span> : null}
                        </th>
                      );
                    }
                    return (
                      <td key={column.id} className={className}>
                        <CellText value={value} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {report.totals ? (
            <tfoot>
              <TotalRow columns={report.columns} totals={report.totals} edge="bottom" />
            </tfoot>
          ) : null}
        </table>
      </div>
      {report.pageCount > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
          {report.page > 1 ? (
            <Link href={pageHref(report.page - 1)} className={ui.secondaryButton}>
              {reportCopy.previous}
            </Link>
          ) : (
            <span className={cn(ui.secondaryButton, "pointer-events-none opacity-50")}>
              {reportCopy.previous}
            </span>
          )}
          <p className="text-sm text-slate-600">
            {report.page} / {report.pageCount}
          </p>
          {report.page < report.pageCount ? (
            <Link href={pageHref(report.page + 1)} className={ui.secondaryButton}>
              {reportCopy.next}
            </Link>
          ) : (
            <span className={cn(ui.secondaryButton, "pointer-events-none opacity-50")}>
              {reportCopy.next}
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}

function TotalRow({
  columns,
  totals,
  edge,
}: {
  columns: BuiltReport["columns"];
  totals: Record<string, string>;
  edge: "top" | "bottom";
}) {
  return (
    <tr data-row-kind="grand-total">
      {columns.map((column) => (
        <td
          key={column.id}
          className={cn(
            "px-4 py-3 font-semibold text-ink",
            edge === "top" ? "border-b border-slate-200 bg-slate-50" : "border-t border-slate-200",
            isAmountColumn(column.id) && "text-right tabular-nums",
          )}
        >
          <CellText value={totals[column.id] ?? ""} />
        </td>
      ))}
    </tr>
  );
}

function isAmountColumn(id: string) {
  return id === "amount" || id === "noAmount" || id.startsWith("amount:");
}

function CellText({ value }: { value: string }) {
  if (!value) return null;
  const lines = value.split("\n");
  return (
    <>
      {lines.map((line, index) => (
        <span key={`${line}-${index}`} className={index === 0 ? "block whitespace-pre-wrap break-words" : "mt-1 block whitespace-pre-wrap break-words"}>
          {line}
        </span>
      ))}
    </>
  );
}
