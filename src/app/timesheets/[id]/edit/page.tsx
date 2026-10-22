import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TimeEntryForm } from "@/components/time-entry-form";
import { DeleteTimeEntryButton } from "@/components/time-entry-delete";
import { getWorkspaceTimeZone } from "@/lib/bill-rates";
import { entryTimeZoneNote } from "@/lib/rate-copy";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";
import { timeCopy } from "@/lib/time-copy";
import { getTimeEntry, listOverlapCandidates, listProjectChoices } from "@/lib/time-entries";
import { listPickerTodos } from "@/lib/todos";
import { todoCopy } from "@/lib/todo-copy";
import { timesheetsHref } from "@/lib/timesheet";
import { isRealCalendarDate, todayInTimeZone, zonedParts } from "@/lib/time-zone";
import { ui } from "@/lib/ui";

type EditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
};

export async function generateMetadata({
  params,
}: EditPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  const entry = user
    ? await getTimeEntry(id, canManageWorkspace(user.role) ? null : user.id)
    : null;
  return { title: entry ? "Edit time entry" : "Time entry not found" };
}

export default async function EditTimeEntryPage({
  params,
  searchParams,
}: EditPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();
  const entry = await getTimeEntry(id, canManageWorkspace(user.role) ? null : user.id);
  if (!entry) notFound();

  const query = await searchParams;
  const timeZone = await getWorkspaceTimeZone();

  if (!entry.endedAt) {
    const requestedDate = (query.date ?? "").trim();
    const returnDate = isRealCalendarDate(requestedDate)
      ? requestedDate
      : todayInTimeZone(timeZone);
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-ink">
          {timeCopy.stopTimerFirstTitle}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{timeCopy.stopTimerFirstBody}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link href="/timesheets" className={ui.primaryButton}>
            Back to timesheets
          </Link>
          <DeleteTimeEntryButton
            id={entry.id}
            date={returnDate}
            label={entry.project.name}
          />
        </div>
      </div>
    );
  }

  const [projects, overlaps, todos] = await Promise.all([
    listProjectChoices(entry.projectId),
    listOverlapCandidates(new Date(), entry.userId ?? user.id),
    listPickerTodos(user),
  ]);
  const pinned =
    entry.todo && (entry.todo.status !== "open" || entry.todo.archivedAt)
      ? {
          id: entry.todo.id,
          projectId: entry.projectId,
          title: entry.todo.title,
          label: entry.todo.archivedAt ? todoCopy.archived : todoCopy.done,
        }
      : null;
  const start = zonedParts(entry.startedAt, timeZone);
  const end = zonedParts(entry.endedAt, timeZone);
  const requestedDate = (query.date ?? "").trim();
  const returnDate = isRealCalendarDate(requestedDate) ? requestedDate : start.date;

  return (
    <div>
      <TimeEntryForm
        mode="edit"
        entryId={entry.id}
        timeZone={timeZone}
        projects={projects}
        todos={todos}
        pinnedTodo={pinned}
        overlaps={overlaps}
        cancelHref={timesheetsHref({ date: returnDate })}
        title="Edit time entry"
        description={`Update this entry. ${entryTimeZoneNote(timeZone)}`}
        submitLabel="Save changes"
        initialState={{
          errors: {},
          values: {
            projectId: entry.projectId,
            date: start.date,
            endDate: end.date === start.date ? "" : end.date,
            startTime: start.time,
            endTime: end.time,
            billable: entry.billable,
            note: entry.note ?? "",
            todoId: entry.todoId ?? "",
            timeZone,
          },
        }}
      />
      <div className="mx-auto mt-4 flex max-w-2xl justify-end">
        <DeleteTimeEntryButton
          id={entry.id}
          date={returnDate}
          label={entry.project.name}
        />
      </div>
    </div>
  );
}
