import Link from "next/link";
import { ClockIcon, SearchIcon } from "@/components/icons";
import { timeCopy } from "@/lib/time-copy";
import {
  timesheetEmptyCopy,
  timesheetsHref,
  type TimesheetView,
} from "@/lib/timesheet";
import { ui } from "@/lib/ui";

export function TimesheetEmptyState({
  view,
  filtered,
  date,
  addHref,
}: {
  view: TimesheetView;
  filtered: boolean;
  date: string;
  addHref: string;
}) {
  const copy = timesheetEmptyCopy({ view, filtered });
  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-800">
        {filtered ? <SearchIcon className="h-6 w-6" /> : <ClockIcon className="h-6 w-6" />}
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">{copy.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{copy.body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {copy.clearLabel ? (
          <Link href={timesheetsHref({ view, date })} className={ui.secondaryButton}>
            {copy.clearLabel}
          </Link>
        ) : null}
        <Link href={addHref} className={ui.primaryButton}>
          {timeCopy.addTime}
        </Link>
      </div>
    </div>
  );
}

export function TimezonePending() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-slate-900">
        {timeCopy.timezoneLoadingTitle}
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        {timeCopy.timezoneLoadingBody}
      </p>
    </div>
  );
}

export function NoActiveProjects() {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-slate-900">
        {timeCopy.noProjectsTitle}
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        {timeCopy.noProjects}
      </p>
      <Link href="/projects/new" className={`${ui.primaryButton} mt-6`}>
        {timeCopy.addProject}
      </Link>
    </div>
  );
}
