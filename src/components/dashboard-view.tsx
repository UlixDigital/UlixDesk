"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSharedNow } from "@/components/shared-now";
import { cn } from "@/lib/cn";
import { dashboardCopy } from "@/lib/dashboard-copy";
import {
  dailyProgressPercent,
  deltaDirection,
  formatClock,
  formatHm,
  type BudgetRow,
  type DashboardPayload,
  type DashboardScope,
  type ProjectRow,
  type TeamRow,
} from "@/lib/dashboard-format";

const POLL_MS = 30_000;

export function DashboardView({ initial }: { initial: DashboardPayload }) {
  const [data, setData] = useState(initial);
  const [chart, setChart] = useState<"line" | "bar">("line");
  const [activityTab, setActivityTab] = useState<"online" | "worked">("online");
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setData(initial);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    const scope = data.scope;
    const timer = window.setInterval(() => {
      void fetch(`/api/dashboard?scope=${scope}`, { cache: "no-store" })
        .then(async (response) => {
          if (cancelled || !response.ok) return;
          const body = (await response.json()) as { dashboard?: DashboardPayload };
          if (!cancelled && body.dashboard?.scope === scope) setData(body.dashboard);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [data.scope]);

  const now = useSharedNow(data.serverNow);
  const tick = Math.max(0, now - data.serverNow);
  const extra = tick * data.runningTimers;

  return (
    <div className="min-w-0" data-scope={data.scope}>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{dashboardCopy.title}</h1>
      <p className="mt-1 text-sm text-slate-500">{data.weekLabel}</p>
      {data.canChooseScope ? <ScopeSwitch scope={data.scope} /> : null}

      <section
        id="dashboard-kpis"
        aria-label="Summary"
        className="mt-6 grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4"
      >
        <Kpi
          label={dashboardCopy.workedToday}
          value={formatClock(data.kpis.workedTodayMs + extra)}
          deltaMs={data.kpis.workedTodayDeltaMs + extra}
          compare={dashboardCopy.vsYesterday}
          sparkline={data.kpis.todaySparkline}
        />
        <Kpi
          label={dashboardCopy.workedWeek}
          value={formatClock(data.kpis.workedWeekMs + extra)}
          deltaMs={data.kpis.workedWeekDeltaMs + extra}
          compare={dashboardCopy.vsLastWeek}
          sparkline={data.kpis.weekSparkline}
          divided
        />
        <Kpi
          label={dashboardCopy.onlineNow}
          value={dashboardCopy.onlineCaption(data.kpis.online, data.kpis.teamSize)}
          deltaCount={data.kpis.onlineDelta}
          compare={dashboardCopy.vsYesterday}
          sparkline={data.kpis.onlineSparkline}
          divided
        />
        <Kpi
          label={dashboardCopy.projectsWorked}
          value={String(data.kpis.projectsWorked)}
          deltaCount={data.kpis.projectsDelta}
          compare={dashboardCopy.vsLastWeek}
          sparkline={data.kpis.projectsSparkline}
          divided
        />
      </section>

      <section
        id="who-is-online"
        aria-label={dashboardCopy.whoOnline}
        className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className={cardTitle}>{dashboardCopy.whoOnline}</h2>
          <div role="tablist" aria-label={dashboardCopy.whoOnline} className="inline-flex rounded-lg bg-slate-100 p-0.5">
            <SegmentButton
              tab
              selected={activityTab === "online"}
              onClick={() => setActivityTab("online")}
              label={`${dashboardCopy.tabOnline} (${data.online.length})`}
            />
            <SegmentButton
              tab
              selected={activityTab === "worked"}
              onClick={() => setActivityTab("worked")}
              label={`${dashboardCopy.tabWorked} (${data.workedToday.length})`}
            />
          </div>
        </div>
        {activityTab === "online" ? (
          data.online.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">{dashboardCopy.nobodyOnline}</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {data.online.map((person) => (
                <li key={person.userId} className="flex items-center gap-3 py-3">
                  <Avatar name={person.name} initial={person.initial} color={person.color} online />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{person.name}</p>
                    <p className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-slate-600">
                      <MiniBadge initial={person.projectInitial} color={person.projectColor} />
                      <span className="truncate">{person.projectName}</span>
                      {person.todoTitle ? <span className="truncate text-slate-400">· {person.todoTitle}</span> : null}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold text-ink tabular-nums">
                      <LiveElapsed startedAt={person.startedAt} serverNow={data.serverNow} />
                    </p>
                    <p className="text-xs text-slate-400">{dashboardCopy.startedAt(person.startedLabel)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : data.workedToday.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{dashboardCopy.nobodyWorked}</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {data.workedToday.map((person) => (
              <li key={person.userId} className="flex items-center gap-3 py-3">
                <Avatar name={person.name} initial={person.initial} color={person.color} online={person.online} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{person.name}</p>
                  <p className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-slate-600">
                    {person.projectName && person.projectInitial && person.projectColor ? (
                      <MiniBadge initial={person.projectInitial} color={person.projectColor} />
                    ) : null}
                    <span className="truncate">{person.projectName ?? "No project"}</span>
                    {person.todoTitle ? <span className="truncate text-slate-400">· {person.todoTitle}</span> : null}
                  </p>
                </div>
                <p className="font-mono text-sm font-semibold text-ink tabular-nums">
                  {formatHm(person.ms + (person.online ? tick : 0))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ProjectsCard
          projects={data.projects}
          open={openProjects}
          onToggle={(id) => setOpenProjects((current) => ({ ...current, [id]: !current[id] }))}
        />
        <section
          id="dashboard-week"
          aria-label={dashboardCopy.thisWeek}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className={cardTitle}>{dashboardCopy.thisWeek}</h2>
            <div role="group" aria-label={dashboardCopy.chartType} className="inline-flex rounded-lg bg-slate-100 p-0.5">
              <SegmentButton selected={chart === "line"} onClick={() => setChart("line")} label={dashboardCopy.line} />
              <SegmentButton selected={chart === "bar"} onClick={() => setChart("bar")} label={dashboardCopy.bar} />
            </div>
          </div>
          <WeekChart days={data.days} mode={chart} />
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <TeamCard team={data.team} tick={tick} />
        <BudgetsCard budgets={data.budgets} showMoney={data.showMoney} />
      </div>
    </div>
  );
}

const cardTitle = "text-xs font-semibold tracking-[0.08em] text-slate-400 uppercase";
const kpiLabel = "text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase";
const kpiValue = "mt-2 text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums";

function ScopeSwitch({ scope }: { scope: DashboardScope }) {
  return (
    <nav aria-label={dashboardCopy.scopeLabel} className="mt-4 flex gap-6 border-b border-slate-200">
      <ScopeLink href="/dashboard?scope=me" label={dashboardCopy.scopeMe} current={scope === "me"} />
      <ScopeLink href="/dashboard?scope=all" label={dashboardCopy.scopeAll} current={scope === "all"} />
    </nav>
  );
}

function ScopeLink({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "-mb-px border-b-2 px-0.5 pb-2 text-sm font-semibold tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
        current ? "border-[#3b82f6] text-[#2563eb]" : "border-transparent text-slate-400 hover:text-slate-600",
      )}
    >
      {label}
    </Link>
  );
}

function Kpi({
  label,
  value,
  deltaMs,
  deltaCount,
  compare,
  sparkline,
  divided = false,
}: {
  label: string;
  value: string;
  deltaMs?: number;
  deltaCount?: number;
  compare: string;
  sparkline: number[];
  divided?: boolean;
}) {
  const delta = deltaCount ?? deltaMs ?? 0;
  const direction = deltaDirection(delta);
  const text = deltaCount === undefined ? formatClock(Math.abs(deltaMs ?? 0)) : String(Math.abs(deltaCount));
  const tone =
    direction === "up" ? "text-emerald-600" : direction === "down" ? "text-rose-500" : "text-slate-400";
  return (
    <div className={cn("px-5 py-4", divided && "border-slate-100 sm:border-l")}>
      <p className={kpiLabel}>{label}</p>
      <p className={kpiValue}>{value}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <Sparkline values={sparkline} />
        <p className={cn("inline-flex items-center gap-1 text-xs font-semibold tabular-nums", tone)}>
          <TrendIcon direction={direction} />
          <span>
            {text}
            <span className="sr-only"> {compare}</span>
          </span>
        </p>
      </div>
    </div>
  );
}

function TrendIcon({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "flat") return <span aria-hidden="true">–</span>;
  const up = direction === "up";
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
      <path d={up ? "M6 1.5 10.5 8.5H1.5Z" : "M6 10.5 1.5 3.5h9Z"} fill="currentColor" />
    </svg>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 112;
  const height = 32;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-24" aria-hidden="true">
      <path
        d={sparkPath(values, width, height)}
        fill="none"
        stroke="#7c5cfc"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function sparkPath(values: number[], width: number, height: number) {
  const points = values.length > 0 ? values : [0];
  const pad = 3;
  const max = Math.max(...points);
  const min = Math.min(...points);
  if (max === min) return `M ${pad} ${height / 2} L ${width - pad} ${height / 2}`;
  const span = max - min;
  const step = points.length === 1 ? 0 : (width - pad * 2) / (points.length - 1);
  return smoothPath(
    points.map((value, index) => ({
      x: pad + step * index,
      y: pad + (height - pad * 2) * (1 - (value - min) / span),
    })),
  );
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) return `M ${first.x} ${first.y}`;
  let path = `M ${first.x} ${first.y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

function SegmentButton({
  selected,
  onClick,
  label,
  tab = false,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  tab?: boolean;
}) {
  return (
    <button
      type="button"
      role={tab ? "tab" : undefined}
      aria-selected={tab ? selected : undefined}
      aria-pressed={tab ? undefined : selected}
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-slate-700",
      )}
    >
      {label}
    </button>
  );
}

function Avatar({
  name,
  initial,
  color,
  online,
}: {
  name: string;
  initial: string;
  color: string;
  online?: boolean;
}) {
  return (
    <span
      className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      <span className="sr-only">{name}</span>
      <span aria-hidden="true">{initial}</span>
      {online ? (
        <span
          className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
          aria-label="Online"
        />
      ) : null}
    </span>
  );
}

function MiniBadge({ initial, color }: { initial: string; color: string }) {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

function LiveElapsed({ startedAt, serverNow }: { startedAt: string; serverNow: number }) {
  const now = useSharedNow(serverNow);
  return <>{formatClock(Math.max(0, now - Date.parse(startedAt)))}</>;
}

function ProjectsCard({
  projects,
  open,
  onToggle,
}: {
  projects: ProjectRow[];
  open: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <section
      id="dashboard-projects"
      aria-label={dashboardCopy.projects}
      className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className={cardTitle}>{dashboardCopy.projects}</h2>
      {projects.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{dashboardCopy.noProjects}</p>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            <span>{dashboardCopy.projectColumn}</span>
            <span>{dashboardCopy.timeColumn}</span>
          </div>
          <ul className="mt-1 divide-y divide-slate-100">
            {projects.map((project) => {
              const expanded = Boolean(open[project.id]);
              return (
                <li key={project.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: project.color }}
                      aria-hidden="true"
                    >
                      {project.initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium text-ink">{project.name}</p>
                        <span
                          className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[11px] font-semibold text-white"
                          title={dashboardCopy.shareLabel(project.sharePercent)}
                        >
                          {project.sharePercent}%
                        </span>
                      </div>
                      {project.topTodo ? (
                        <p className="mt-0.5 truncate text-xs text-slate-400">{project.topTodo}</p>
                      ) : null}
                    </div>
                    <p className="font-mono text-sm text-slate-700 tabular-nums">{formatClock(project.ms)}</p>
                  </div>
                  <div className="mt-2 pl-10">
                    <Bar percent={project.sharePercent} label={dashboardCopy.shareLabel(project.sharePercent)} />
                  </div>
                  {project.todos.length > 0 ? (
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => onToggle(project.id)}
                      className="mt-2 ml-10 text-xs font-semibold text-primary-700 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {expanded ? dashboardCopy.hideTodos : dashboardCopy.showTodos}
                    </button>
                  ) : null}
                  {expanded ? (
                    <ul className="mt-2 space-y-2 pl-10">
                      {project.todos.map((todo) => (
                        <li key={todo.id}>
                          <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
                            <span className="truncate">{todo.title}</span>
                            <span className="font-mono tabular-nums">{formatClock(todo.ms)}</span>
                          </div>
                          <Bar
                            percent={project.ms > 0 ? Math.round((todo.ms * 100) / project.ms) : 0}
                            label={todo.title}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="mt-auto flex justify-end pt-3">
        <ReportLink href={dashboardCopy.timeActivityReport} />
      </div>
    </section>
  );
}

function TeamCard({ team, tick }: { team: TeamRow[]; tick: number }) {
  return (
    <section
      id="team-hours"
      aria-label={dashboardCopy.teamHours}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className={cardTitle}>{dashboardCopy.teamHours}</h2>
        <p className="text-xs font-medium text-slate-400">{dashboardCopy.dailyReference}</p>
      </div>
      {team.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{dashboardCopy.noTeamHours}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-3 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            <span>{dashboardCopy.memberColumn}</span>
            <span className="text-right">{dashboardCopy.today}</span>
            <span className="text-right">{dashboardCopy.week}</span>
          </div>
          <ul className="mt-1 divide-y divide-slate-100">
            {team.map((person) => {
              const today = person.todayMs + (person.running ? tick : 0);
              const week = person.weekMs + (person.running ? tick : 0);
              return (
                <li key={person.userId} className="py-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={person.name} initial={person.initial} color={person.color} online={person.running} />
                      <p className="truncate text-sm font-medium text-ink">{person.name}</p>
                    </div>
                    <p className="text-right text-sm font-medium text-ink tabular-nums">{formatHm(today)}</p>
                    <p className="text-right text-sm font-medium text-ink tabular-nums">{formatHm(week)}</p>
                  </div>
                  <div className="mt-2 pl-12">
                    <Bar percent={dailyProgressPercent(today)} label={`${person.name} ${dashboardCopy.dailyReference}`} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function BudgetsCard({ budgets, showMoney }: { budgets: BudgetRow[]; showMoney: boolean }) {
  return (
    <section
      id="project-budgets"
      aria-label={dashboardCopy.budgets}
      className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className={cardTitle}>{dashboardCopy.budgets}</h2>
      {budgets.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{showMoney ? dashboardCopy.noBudgets : dashboardCopy.memberBudgets}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {budgets.map((budget) => (
            <li key={budget.id} className="py-3">
              <div className="flex items-start gap-3">
                <span
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: budget.color }}
                  aria-hidden="true"
                >
                  {budget.initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{budget.name}</p>
                  <p className="text-xs text-slate-400">{budget.typeLabel}</p>
                </div>
                <p className="text-right text-sm font-medium text-ink tabular-nums">
                  {dashboardCopy.spentOf(budget.spentLabel, budget.budgetLabel)}
                </p>
              </div>
              <div className="mt-2 pl-10">
                <Bar percent={budget.progressPercent ?? 0} label={`${budget.name} budget`} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex justify-end pt-3">
        <ReportLink href={dashboardCopy.budgetReport} />
      </div>
    </section>
  );
}

function ReportLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-[#2563eb] hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {dashboardCopy.viewReport} <span aria-hidden="true">&gt;</span>
    </Link>
  );
}

function Bar({ percent, label }: { percent: number; label: string }) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-slate-100"
      role="progressbar"
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-[#3b82f6]" style={{ width: `${width}%` }} />
    </div>
  );
}

function WeekChart({
  days,
  mode,
}: {
  days: Array<{ date: string; label: string; ms: number }>;
  mode: "line" | "bar";
}) {
  const width = 640;
  const height = 220;
  const padL = 16;
  const padR = 16;
  const padT = 28;
  const padB = 32;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(...days.map((day) => day.ms), 1);
  const baseline = padT + innerH;
  const coords = days.map((day, index) => {
    const x = days.length === 1 ? padL + innerW / 2 : padL + (innerW * index) / (days.length - 1);
    const y = padT + innerH * (1 - day.ms / max);
    return { ...day, x, y };
  });
  const line = smoothPath(coords.map((point) => ({ x: point.x, y: point.y })));
  const last = coords[coords.length - 1];
  const first = coords[0];
  const area = first && last ? `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z` : "";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-3 h-auto w-full"
      role="img"
      aria-label={mode === "line" ? dashboardCopy.lineGraphLabel : dashboardCopy.barChartLabel}
    >
      {mode === "line" ? (
        <>
          <path d={area} fill="#3b82f6" opacity="0.14" />
          <path d={line} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round" />
          {coords.map((point) => (
            <g key={point.date}>
              <text x={point.x} y={Math.max(12, point.y - 10)} textAnchor="middle" fontSize="11" fill="#64748b">
                {formatHm(point.ms)}
              </text>
              <circle cx={point.x} cy={point.y} r="4" fill="white" stroke="#3b82f6" strokeWidth="2" />
              <text x={point.x} y={height - 8} textAnchor="middle" fontSize="12" fill="#64748b">
                {point.label}
              </text>
            </g>
          ))}
        </>
      ) : (
        days.map((day, index) => {
          const slot = innerW / Math.max(days.length, 1);
          const barW = Math.min(28, slot * 0.42);
          const x = padL + slot * index + (slot - barW) / 2;
          const barH = innerH * (day.ms / max);
          const y = baseline - barH;
          return (
            <g key={day.date}>
              <text x={x + barW / 2} y={Math.max(14, y - 8)} textAnchor="middle" fontSize="11" fill="#64748b">
                {formatHm(day.ms)}
              </text>
              <rect x={x} y={y} width={barW} height={Math.max(barH, 0)} rx="3" fill="#3b82f6" />
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize="12" fill="#64748b">
                {day.label}
              </text>
            </g>
          );
        })
      )}
    </svg>
  );
}
