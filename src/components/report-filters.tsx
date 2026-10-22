"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { reportCopy } from "@/lib/report-copy";
import {
  reportHref,
  reportPath,
  type BillableFilter,
  type GroupBy,
  type ReportKind,
  type ReportPreset,
} from "@/lib/report-query";
import { ui } from "@/lib/ui";

type Option = { id: string; name: string; archived?: boolean };

export function ReportFilters({
  kind,
  preset,
  from,
  to,
  memberId,
  clientId,
  projectId,
  todoId,
  billable,
  groupBy,
  columns,
  projects,
  todos = [],
  clients,
  people = [],
  filtered,
}: {
  kind: ReportKind;
  preset: ReportPreset;
  from: string;
  to: string;
  memberId: string;
  clientId: string;
  projectId: string;
  todoId: string;
  billable: BillableFilter;
  groupBy: GroupBy;
  columns: string[] | null;
  projects: Option[];
  todos?: Option[];
  clients: Option[];
  people?: Option[];
  filtered: boolean;
}) {
  return (
    <form
      action={reportPath(kind)}
      method="get"
      aria-label={reportCopy.filtersLabel}
      className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      onChange={(event) => {
        const id = (event.target as HTMLElement).id;
        if (id === "report-from" || id === "report-to") {
          const preset = event.currentTarget.elements.namedItem("preset");
          if (preset instanceof HTMLSelectElement) preset.value = "custom";
        }
        if (id.startsWith("report-")) event.currentTarget.requestSubmit();
      }}
    >
      {columns ? <input type="hidden" name="columns" value={columns.join(",")} readOnly /> : null}
      <Field label={reportCopy.presetLabel} id="report-preset">
        <select id="report-preset" name="preset" defaultValue={preset} className={ui.input}>
          <option value="today">{reportCopy.presetToday}</option>
          <option value="this-week">{reportCopy.presetThisWeek}</option>
          <option value="last-week">{reportCopy.presetLastWeek}</option>
          <option value="this-month">{reportCopy.presetThisMonth}</option>
          <option value="last-month">{reportCopy.presetLastMonth}</option>
          <option value="custom">{reportCopy.presetCustom}</option>
        </select>
      </Field>
      <Field label={reportCopy.fromLabel} id="report-from">
        <input
          id="report-from"
          name="from"
          type="date"
          required
          defaultValue={from}
          className={ui.input}
        />
      </Field>
      <Field label={reportCopy.toLabel} id="report-to">
        <input id="report-to" name="to" type="date" required defaultValue={to} className={ui.input} />
      </Field>
      {people.length > 0 ? (
        <Field label={reportCopy.memberLabel} id="report-member">
          <select id="report-member" name="member" key={memberId} defaultValue={memberId} className={ui.input}>
            <option value="">{reportCopy.allMembers}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label={reportCopy.clientLabel} id="report-client">
        <select id="report-client" name="client" key={clientId} defaultValue={clientId} className={ui.input}>
          <option value="">{reportCopy.allClients}</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.archived ? `${client.name} (Archived)` : client.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={reportCopy.projectLabel} id="report-project">
        <select
          id="report-project"
          name="project"
          key={projectId}
          defaultValue={projectId}
          className={ui.input}
        >
          <option value="">{reportCopy.allProjects}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.archived ? `${project.name} (Archived)` : project.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={reportCopy.todoColumn} id="report-todo">
        <select id="report-todo" name="todo" key={todoId} defaultValue={todoId} className={ui.input}>
          <option value="">{reportCopy.allTodos}</option>
          {todos.map((todo) => (
            <option key={todo.id} value={todo.id}>
              {todo.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={reportCopy.billableLabel} id="report-billable">
        <select
          id="report-billable"
          name="billable"
          key={billable}
          defaultValue={billable}
          className={ui.input}
        >
          <option value="all">{reportCopy.billableAll}</option>
          <option value="billable">{reportCopy.billableOnly}</option>
          <option value="non-billable">{reportCopy.billableNone}</option>
        </select>
      </Field>
      <Field label={reportCopy.groupLabel} id="report-group">
        <select id="report-group" name="group" key={groupBy} defaultValue={groupBy} className={ui.input}>
          {people.length > 0 ? <option value="member">{reportCopy.groupMember}</option> : null}
          <option value="client">{reportCopy.groupClient}</option>
          <option value="project">{reportCopy.groupProject}</option>
          <option value="todo">{reportCopy.groupTodo}</option>
          <option value="date">{reportCopy.groupDate}</option>
        </select>
      </Field>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
        <button type="submit" className={ui.secondaryButton}>
          {reportCopy.filter}
        </button>
        {filtered ? (
          <Link href={reportHref(kind, {})} className={ui.secondaryButton}>
            {reportCopy.clearFilters}
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
