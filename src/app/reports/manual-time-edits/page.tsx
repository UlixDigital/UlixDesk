import type { Metadata } from "next";
import { SaveReportDialog } from "@/components/save-report-dialog";
import { TimeChangeFilters } from "@/components/time-change-filters";
import { TimeChangeList } from "@/components/time-change-list";
import { getCurrentUser } from "@/lib/session";
import { timeChangeCodes, timeChangeCopy, timeEditsPdfHref } from "@/lib/time-change-copy";
import { prepareTimeEdits } from "@/lib/time-change-request";
import { ui } from "@/lib/ui";

export const metadata: Metadata = {
  title: timeChangeCopy.pageTitle,
};

export default async function ManualTimeEditsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getCurrentUser();
  if (!actor) return null;
  const prepared = await prepareTimeEdits({ actor, params: await searchParams });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{timeChangeCopy.pageTitle}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {prepared.manager ? timeChangeCopy.allScope : timeChangeCopy.ownScope} {timeChangeCopy.intro}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={timeEditsPdfHref({
              from: prepared.from,
              to: prepared.to,
              memberId: prepared.memberId,
              clientId: prepared.clientId,
              projectId: prepared.projectId,
              action: prepared.action,
            })}
            className={ui.secondaryButton}
          >
            {timeChangeCopy.exportPdf}
          </a>
          <SaveReportDialog
            canShare={prepared.manager}
            fields={{
              reportType: "manual-time-edits",
              from: prepared.from,
              to: prepared.to,
              member: prepared.memberId,
              client: prepared.clientId,
              project: prepared.projectId,
              action: prepared.action,
            }}
          />
        </div>
      </div>
      <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
        {timeChangeCopy.historyNote}
      </p>
      <p className="mt-3 text-sm text-slate-500">{timeChangeCopy.exportAll}</p>
      <TimeChangeFilters
        from={prepared.from}
        to={prepared.to}
        memberId={prepared.memberId}
        clientId={prepared.clientId}
        projectId={prepared.projectId}
        action={prepared.action}
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
      {prepared.failure === "range" ? (
        <p
          role="alert"
          data-error-code={timeChangeCodes.RANGE_ORDER}
          className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {timeChangeCopy.rangeOrder}
        </p>
      ) : (
        <TimeChangeList
          items={prepared.items}
          total={prepared.total}
          page={prepared.page}
          pageSize={prepared.pageSize}
          pageCount={prepared.pageCount}
          filtered={prepared.filtered}
          href={{
            from: prepared.from,
            to: prepared.to,
            memberId: prepared.memberId,
            clientId: prepared.clientId,
            projectId: prepared.projectId,
            action: prepared.action,
          }}
        />
      )}
    </div>
  );
}
