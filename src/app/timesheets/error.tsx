"use client";

import { ui } from "@/lib/ui";

export default function TimesheetsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">
        We could not load this page
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Something went wrong while reading time entries. The local database is
        unchanged.
      </p>
      <button type="button" onClick={reset} className={`${ui.primaryButton} mt-6`}>
        Try again
      </button>
    </div>
  );
}
