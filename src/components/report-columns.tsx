"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportCopy } from "@/lib/report-copy";
import { columnLabel, type ReportKind } from "@/lib/report-query";
import { cn } from "@/lib/cn";

const storageKey = (kind: ReportKind) => `ulixdesk.report-columns.${kind}`;

export function ReportColumns({
  kind,
  baseHref,
  columns,
  columnsInUrl,
  choices,
}: {
  kind: ReportKind;
  /** Report URL without a columns param. Saved columns are added on the client. */
  baseHref: string;
  columns: string[];
  columnsInUrl: boolean;
  choices: string[];
}) {
  const saved = columns.join(",");

  useEffect(() => {
    const key = storageKey(kind);
    if (!columnsInUrl) {
      const remembered = window.localStorage.getItem(key);
      if (!remembered || remembered === saved) return;
      const url = new URL(baseHref, window.location.origin);
      url.searchParams.set("columns", remembered);
      window.location.replace(`${url.pathname}${url.search}`);
      return;
    }
    window.localStorage.setItem(key, saved);
  }, [kind, columnsInUrl, saved, baseHref]);

  return (
    <div className="mt-4">
      <p id="report-columns-label" className="text-sm font-medium text-slate-800">
        {reportCopy.columnsLabel}
      </p>
      <div role="group" aria-labelledby="report-columns-label" className="mt-1.5 flex flex-wrap gap-2">
        {choices.map((id) => {
          const on = columns.includes(id);
          const next = on ? columns.filter((column) => column !== id) : [...columns, id];
          const url = new URL(baseHref, "http://ulixdesk.local");
          url.searchParams.set("columns", next.join(","));
          return (
            <Link
              key={id}
              href={`${url.pathname}${url.search}`}
              aria-pressed={on}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                on
                  ? "bg-primary-50 text-accent ring-primary-200"
                  : "bg-white text-slate-700 ring-slate-300",
              )}
            >
              {columnLabel(id)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
