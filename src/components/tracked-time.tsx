import { timeCopy } from "@/lib/time-copy";
import { formatTrackedDuration } from "@/lib/timesheet";

export function TrackedTime({ milliseconds }: { milliseconds: number }) {
  return (
    <section
      aria-label={timeCopy.trackedTitle}
      className="rounded-xl border border-slate-200 bg-white px-4 py-5 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:px-6"
    >
      <h2 className="text-sm font-medium text-slate-500">{timeCopy.trackedTitle}</h2>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
        {formatTrackedDuration(milliseconds)}
      </p>
      <p className="mt-2 text-sm text-slate-600">{timeCopy.trackedHint}</p>
    </section>
  );
}
