import Link from "next/link";
import { ui } from "@/lib/ui";

export default function TimeEntryNotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Time entry not found</h1>
      <p className="mt-2 text-sm text-slate-600">That time entry does not exist.</p>
      <Link href="/timesheets" className={`${ui.primaryButton} mt-6`}>
        Back to timesheets
      </Link>
    </div>
  );
}
