import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TimeEntryForm } from "@/components/time-entry-form";
import { DeleteTimeEntryButton } from "@/components/time-entry-delete";
import { TimezonePending } from "@/components/timesheet-empty-state";
import { getRequestTimeZone } from "@/lib/request-time-zone";
import { timeCopy } from "@/lib/time-copy";
import { getTimeEntry, listOverlapCandidates, listProjectChoices } from "@/lib/time-entries";
import { timesheetsHref } from "@/lib/timesheet";
import { isRealCalendarDate, zonedParts } from "@/lib/time-zone";
import { ui } from "@/lib/ui";

type EditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
};

export async function generateMetadata({
  params,
}: EditPageProps): Promise<Metadata> {
  const { id } = await params;
  const entry = await getTimeEntry(id);
  return { title: entry ? "Edit time entry" : "Time entry not found" };
}

export default async function EditTimeEntryPage({
  params,
  searchParams,
}: EditPageProps) {
  const { id } = await params;
  const entry = await getTimeEntry(id);
  if (!entry) notFound();

  const query = await searchParams;
  const timeZone = await getRequestTimeZone();
  if (!timeZone) return <TimezonePending />;

  if (!entry.endedAt) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          {timeCopy.stopTimerFirstTitle}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{timeCopy.stopTimerFirstBody}</p>
        <Link href="/timesheets" className={`${ui.primaryButton} mt-6`}>
          Back to timesheets
        </Link>
      </div>
    );
  }

  const projects = await listProjectChoices(entry.projectId);
  const overlaps = await listOverlapCandidates(new Date());
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
        overlaps={overlaps}
        cancelHref={timesheetsHref({ date: returnDate })}
        title="Edit time entry"
        description="Update this entry. Times use your timezone."
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
