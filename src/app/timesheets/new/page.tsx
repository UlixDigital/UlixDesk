import type { Metadata } from "next";
import { TimeEntryForm } from "@/components/time-entry-form";
import { NoActiveProjects } from "@/components/timesheet-empty-state";
import { requireUser } from "@/lib/auth";
import { getWorkspaceTimeZone } from "@/lib/bill-rates";
import { entryTimeZoneNote } from "@/lib/rate-copy";
import { listOverlapCandidates, listProjectChoices } from "@/lib/time-entries";
import { listPickerTodos } from "@/lib/todos";
import { timesheetsHref } from "@/lib/timesheet";
import { isRealCalendarDate, todayInTimeZone } from "@/lib/time-zone";
import {
  billableDefault,
  emptyTimeEntryFormValues,
} from "@/lib/time-validation";

export const metadata: Metadata = {
  title: "Add time",
};

export default async function NewTimeEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; project?: string }>;
}) {
  const timeZone = await getWorkspaceTimeZone();

  const projects = await listProjectChoices(null);
  if (projects.length === 0) return <NoActiveProjects />;

  const params = await searchParams;
  const requestedDate = (params.date ?? "").trim();
  const date = isRealCalendarDate(requestedDate)
    ? requestedDate
    : todayInTimeZone(timeZone);
  const requestedProject = (params.project ?? "").trim();
  const projectId = projects.some((project) => project.id === requestedProject)
    ? requestedProject
    : "";
  const user = await requireUser();
  const [overlaps, todos] = await Promise.all([
    listOverlapCandidates(new Date(), user.id),
    listPickerTodos(user),
  ]);

  return (
    <TimeEntryForm
      mode="create"
      timeZone={timeZone}
      projects={projects}
      todos={todos}
      overlaps={overlaps}
      cancelHref={timesheetsHref({ date })}
      title="Add time"
      description={`Track time against an active project. ${entryTimeZoneNote(timeZone)}`}
      submitLabel="Save time"
      initialState={{
        errors: {},
        values: {
          ...emptyTimeEntryFormValues(timeZone, date),
          projectId,
          billable: billableDefault(projects, projectId),
        },
      }}
    />
  );
}
