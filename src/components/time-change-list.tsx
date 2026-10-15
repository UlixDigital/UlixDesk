import Link from "next/link";
import { cn } from "@/lib/cn";
import { showingChangesLabel, timeChangeCopy, timeEditsHref } from "@/lib/time-change-copy";
import type { TimeChangeView } from "@/lib/time-change-display";
import { ui } from "@/lib/ui";

export function TimeChangeList({
  items,
  total,
  page,
  pageSize,
  pageCount,
  filtered,
  href,
}: {
  items: TimeChangeView[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  filtered: boolean;
  href: {
    from: string;
    to: string;
    memberId: string;
    clientId: string;
    projectId: string;
    action: string;
  };
}) {
  if (items.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <h2 className="text-lg font-semibold text-ink">
          {filtered ? timeChangeCopy.emptyFiltered : timeChangeCopy.empty}
        </h2>
      </div>
    );
  }

  const start = (page - 1) * pageSize + 1;
  const end = start + items.length - 1;
  const pageHref = (nextPage: number) =>
    timeEditsHref({
      from: href.from,
      to: href.to,
      memberId: href.memberId,
      clientId: href.clientId,
      projectId: href.projectId,
      action: href.action,
      page: nextPage,
    });

  return (
    <div className="mt-4">
      <p className="text-sm text-slate-600">{showingChangesLabel(start, end, total)}</p>
      <ol className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn("px-4 py-4 sm:px-5", item.forOther && "bg-amber-50")}
            data-edited-for-other={item.forOther ? "true" : undefined}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{item.byline}</p>
                <p className="mt-1 text-sm text-slate-600">
                  <time dateTime={item.changedAt}>{item.whenLabel}</time>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {item.actionLabel}
                </span>
                <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-accent">
                  {item.sourceLabel}
                </span>
              </div>
            </div>
            {item.unchanged ? (
              <p className="mt-3 text-sm text-slate-600">{timeChangeCopy.unchanged}</p>
            ) : null}
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {item.fields.map((field) => (
                <div key={field.label}>
                  <dt className="text-xs font-medium text-slate-500">{field.label}</dt>
                  <dd className="mt-0.5 text-sm break-words whitespace-pre-wrap text-ink">
                    {field.changed ? (
                      <>
                        <span className="text-slate-500">{field.before}</span>
                        <span aria-hidden="true"> → </span>
                        <span className="sr-only"> to </span>
                        <span className="font-medium">{field.after}</span>
                      </>
                    ) : (
                      field.after
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={ui.secondaryButton}>
              {timeChangeCopy.previous}
            </Link>
          ) : (
            <span className={cn(ui.secondaryButton, "pointer-events-none opacity-50")}>
              {timeChangeCopy.previous}
            </span>
          )}
          <p className="text-sm text-slate-600">
            {page} / {pageCount}
          </p>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className={ui.secondaryButton}>
              {timeChangeCopy.next}
            </Link>
          ) : (
            <span className={cn(ui.secondaryButton, "pointer-events-none opacity-50")}>
              {timeChangeCopy.next}
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
