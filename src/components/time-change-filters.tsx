"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { timeChangeCopy, timeEditsHref, type ChangeActionFilter } from "@/lib/time-change-copy";
import { ui } from "@/lib/ui";

type Option = { id: string; name: string; archived?: boolean };

export function TimeChangeFilters({
  from,
  to,
  memberId,
  clientId,
  projectId,
  action,
  projects,
  clients,
  people = [],
  filtered,
}: {
  from: string;
  to: string;
  memberId: string;
  clientId: string;
  projectId: string;
  action: ChangeActionFilter | "";
  projects: Option[];
  clients: Option[];
  people?: Option[];
  filtered: boolean;
}) {
  return (
    <form
      action="/reports/manual-time-edits"
      method="get"
      aria-label="Filters"
      className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      onChange={(event) => {
        const id = (event.target as HTMLElement).id;
        if (id.startsWith("time-edits-")) event.currentTarget.requestSubmit();
      }}
    >
      <Field label={timeChangeCopy.fromLabel} id="time-edits-from">
        <input
          id="time-edits-from"
          name="from"
          type="date"
          required
          defaultValue={from}
          className={ui.input}
        />
      </Field>
      <Field label={timeChangeCopy.toLabel} id="time-edits-to">
        <input id="time-edits-to" name="to" type="date" required defaultValue={to} className={ui.input} />
      </Field>
      {people.length > 0 ? (
        <Field label={timeChangeCopy.memberLabel} id="time-edits-member">
          <select
            id="time-edits-member"
            name="member"
            key={memberId}
            defaultValue={memberId}
            className={ui.input}
          >
            <option value="">{timeChangeCopy.allMembers}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label={timeChangeCopy.clientLabel} id="time-edits-client">
        <select
          id="time-edits-client"
          name="client"
          key={clientId}
          defaultValue={clientId}
          className={ui.input}
        >
          <option value="">{timeChangeCopy.allClients}</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.archived ? `${client.name} (Archived)` : client.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={timeChangeCopy.projectLabel} id="time-edits-project">
        <select
          id="time-edits-project"
          name="project"
          key={projectId}
          defaultValue={projectId}
          className={ui.input}
        >
          <option value="">{timeChangeCopy.allProjects}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.archived ? `${project.name} (Archived)` : project.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={timeChangeCopy.actionLabel} id="time-edits-action">
        <select
          id="time-edits-action"
          name="action"
          key={action}
          defaultValue={action}
          className={ui.input}
        >
          <option value="">{timeChangeCopy.allActions}</option>
          <option value="added">{timeChangeCopy.actionAdded}</option>
          <option value="edited">{timeChangeCopy.actionEdited}</option>
          <option value="deleted">{timeChangeCopy.actionDeleted}</option>
          <option value="timer">{timeChangeCopy.actionTimer}</option>
        </select>
      </Field>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
        <button type="submit" className={ui.secondaryButton}>
          {timeChangeCopy.filter}
        </button>
        {filtered ? (
          <Link href={timeEditsHref()} className={ui.secondaryButton}>
            {timeChangeCopy.clearFilters}
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
