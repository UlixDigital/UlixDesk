"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dashboardCopy } from "@/lib/dashboard-copy";
import {
  deltaDirection,
  formatClock,
  formatLastUpdated,
  formatPeriodDelta,
  seriesLabel,
  weekBarsLabel,
  type DashboardPayload,
  type ProjectActivity,
} from "@/lib/dashboard-format";
import { weekdayShort } from "@/lib/time-zone";
import { cn } from "@/lib/cn";
import { ui } from "@/lib/ui";

export function DashboardView({ initial }: { initial: DashboardPayload }) {
  const [data, setData] = useState(initial);
  const [updatedLabel, setUpdatedLabel] = useState<string>(dashboardCopy.lastUpdatedJustNow);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setUpdatedLabel(formatLastUpdated(Date.now() - Date.parse(data.generatedAt)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [data.generatedAt]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/dashboard", { headers: { accept: "application/json" } });
      const body = (await response.json().catch(() => null)) as { dashboard?: DashboardPayload; error?: string } | null;
      if (!response.ok || !body?.dashboard?.summary || !Array.isArray(body.dashboard.online)) {
        setError(body?.error || dashboardCopy.refreshFailed);
        return;
      }
      setData(body.dashboard);
    } catch {
      setError(dashboardCopy.refreshFailed);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div id="dashboard-overview" className="min-w-0 max-w-full space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{dashboardCopy.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{dashboardCopy.intro}</p>
        <p className="mt-1 text-sm text-slate-500">{data.weekLabel}</p>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        <SummaryCard
          label={dashboardCopy.workedToday}
          value={formatClock(data.summary.workedTodayMs)}
          delta={formatPeriodDelta(data.summary.workedTodayDeltaMs, "duration", "yesterday")}
          direction={deltaDirection(data.summary.workedTodayDeltaMs)}
          sparkline={data.summary.workedTodaySparkline}
          sparklineKind="duration"
        />
        <SummaryCard
          label={dashboardCopy.projectsWorked}
          hint={dashboardCopy.projectsHint}
          value={String(data.summary.projectsWorked)}
          delta={formatPeriodDelta(data.summary.projectsDelta, "count", "last week")}
          direction={deltaDirection(data.summary.projectsDelta)}
          sparkline={data.summary.projectsSparkline}
          sparklineKind="count"
        />
        <SummaryCard
          label={dashboardCopy.workedWeek}
          value={formatClock(data.summary.workedWeekMs)}
          delta={formatPeriodDelta(data.summary.workedWeekDeltaMs, "duration", "last week")}
          direction={deltaDirection(data.summary.workedWeekDeltaMs)}
          sparkline={data.summary.workedWeekSparkline}
          sparklineKind="duration"
        />
      </div>

      <section
        id="whos-online"
        aria-labelledby="whos-online-heading"
        className="contain-paint min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]"
      >
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <h2 id="whos-online-heading" className="text-base font-semibold text-ink">
            {dashboardCopy.whoOnline}
          </h2>
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-500">{updatedLabel}</p>
            <button
              type="button"
              className={ui.secondaryButton}
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              {refreshing ? dashboardCopy.refreshing : dashboardCopy.refresh}
            </button>
          </div>
        </div>
        {error ? (
          <p role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-800 sm:px-5">
            {error}
          </p>
        ) : null}
        {data.online.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-600 sm:px-5">{dashboardCopy.nobody}</p>
        ) : (
          <div className="min-w-0 max-w-full overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-3 font-medium sm:px-5">{dashboardCopy.memberColumn}</th>
                  <th className="px-3 py-3 font-medium">{dashboardCopy.statusColumn}</th>
                  <th className="px-3 py-3 font-medium">{dashboardCopy.projectColumn}</th>
                  <th className="px-3 py-3 font-medium">{dashboardCopy.clientColumn}</th>
                  <th className="px-3 py-3 font-medium">{dashboardCopy.todoColumn}</th>
                  <th className="px-3 py-3 font-medium">{dashboardCopy.today}</th>
                  <th className="px-3 py-3 font-medium">{dashboardCopy.thisWeek}</th>
                  <th className="px-4 py-3 font-medium sm:px-5">
                    <span className="sr-only">{dashboardCopy.weekChart}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.online.map((person) => (
                  <tr key={person.userId} className="border-t border-slate-100">
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-accent">
                          {person.initial}
                        </span>
                        <span className="font-medium text-ink">{person.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Status working={person.working} />
                    </td>
                    <td className="px-3 py-3 text-ink">{person.projectName ?? dashboardCopy.noProject}</td>
                    <td className="px-3 py-3 text-slate-600">{person.clientName ?? dashboardCopy.noClient}</td>
                    <td className="max-w-56 truncate px-3 py-3 text-slate-600">
                      {person.detail ?? dashboardCopy.noDetail}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-ink">{formatClock(person.todayMs)}</td>
                    <td className="px-3 py-3 tabular-nums text-ink">{formatClock(person.weekMs)}</td>
                    <td className="px-4 py-3 sm:px-5">
                      <WeekBars dates={data.weekDates} values={person.weekBars} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        id="project-activity"
        aria-labelledby="project-activity-heading"
        className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 id="project-activity-heading" className="text-base font-semibold text-ink">
            {dashboardCopy.projectActivity}
          </h2>
          <Link
            href={dashboardCopy.reportHref}
            className="text-sm font-semibold text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {dashboardCopy.viewReport}
          </Link>
        </div>
        {data.projects.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-600 sm:px-5">{dashboardCopy.noProjects}</p>
        ) : (
          <ul>
            {data.projects.map((project) => (
              <ProjectBar key={project.projectId} project={project} maxMs={data.projects[0]?.ms ?? 0} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  hint,
  value,
  delta,
  direction,
  sparkline,
  sparklineKind,
}: {
  label: string;
  hint?: string;
  value: string;
  delta: string;
  direction: "up" | "down" | "flat";
  sparkline: number[];
  sparklineKind: "duration" | "count";
}) {
  return (
    <article
      aria-label={label}
      className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-600">{label}</p>
          {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
        </div>
        <Sparkline values={sparkline} label={seriesLabel(label, sparkline, sparklineKind)} />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      <p
        className={cn(
          "mt-2 text-sm tabular-nums",
          direction === "up" && "text-emerald-700",
          direction === "down" && "text-rose-700",
          direction === "flat" && "text-slate-500",
        )}
      >
        {delta}
      </p>
    </article>
  );
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const width = 112;
  const height = 36;
  const max = Math.max(...values, 0);
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = max <= 0 ? height - 2 : height - 4 - (value / max) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-28 text-accent" role="img" aria-label={label}>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.join(" ")}
      />
    </svg>
  );
}

function WeekBars({ dates, values }: { dates: string[]; values: number[] }) {
  const max = Math.max(...values, 0);
  return (
    <div className="flex h-10 items-end gap-1" role="img" aria-label={weekBarsLabel(dates, values)}>
      {dates.map((date, index) => {
        const value = values[index] ?? 0;
        const height = max <= 0 || value <= 0 ? 0 : Math.max(3, Math.round((value / max) * 28));
        return (
          <div key={date} className="flex w-3 flex-col items-center justify-end gap-1">
            <div className="w-2 rounded-sm bg-accent" style={{ height }} />
            <span className="text-[10px] leading-none text-slate-400">{weekdayShort(date).slice(0, 1)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ProjectBar({ project, maxMs }: { project: ProjectActivity; maxMs: number }) {
  const client = project.clientName ?? dashboardCopy.noClient;
  const width = maxMs <= 0 ? 0 : Math.max(4, Math.round((project.ms / maxMs) * 100));
  return (
    <li className="border-t border-slate-100 px-4 py-3 first:border-t-0 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{project.projectName}</p>
          <p className="truncate text-sm text-slate-500">{client}</p>
        </div>
        <p className="shrink-0 tabular-nums text-sm font-medium text-ink">{formatClock(project.ms)}</p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`${project.projectName}, ${client}, ${formatClock(project.ms)}`}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
      </div>
    </li>
  );
}

function Status({ working }: { working: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        working ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600",
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", working ? "bg-emerald-500" : "bg-slate-400")}
        aria-hidden="true"
      />
      {working ? dashboardCopy.working : dashboardCopy.notWorking}
    </span>
  );
}
