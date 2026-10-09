import type { Metadata } from "next";
import { TimeEntryForm } from "@/components/time-entry-form";
import { NoActiveProjects, TimezonePending } from "@/components/timesheet-empty-state";
import { getRequestTimeZone } from "@/lib/request-time-zone";
import { listOverlapCandidates, listProjectChoices } from "@/lib/time-entries";
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
  const timeZone = await getRequestTimeZone();
  if (!timeZone) return <TimezonePending />;

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
  const overlaps = await listOverlapCandidates(new Date());

  return (
    <TimeEntryForm
      mode="create"
      timeZone={timeZone}
      projects={projects}
      overlaps={overlaps}
      cancelHref={timesheetsHref({ date })}
      title="Add time"
      description="Track time against an active project. Times use your timezone."
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
