"use client";

import Link from "next/link";
import { timesheetsHref, type TimesheetView } from "@/lib/timesheet";
import { timeCopy } from "@/lib/time-copy";
import { ui } from "@/lib/ui";

type Option = { id: string; name: string; archived?: boolean };

export function TimesheetFilters({
  view,
  date,
  projectId,
  clientId,
  projects,
  clients,
}: {
  view: TimesheetView;
  date: string;
  projectId: string;
  clientId: string;
  projects: Option[];
  clients: Option[];
}) {
  const filtered = Boolean(projectId || clientId);

  return (
    <form
      action="/timesheets"
      method="get"
      className="mt-6 flex flex-col gap-2 lg:flex-row lg:items-center"
      onChange={(event) => {
        const id = (event.target as HTMLElement).id;
        if (id === "timesheet-project" || id === "timesheet-client") {
          event.currentTarget.requestSubmit();
        }
      }}
    >
      {view === "week" ? (
        <input type="hidden" name="view" value="week" readOnly />
      ) : null}
      <input type="hidden" name="date" value={date} readOnly />
      <div className="min-w-0 flex-1">
        <label htmlFor="timesheet-project" className="sr-only">
          Filter by project
        </label>
        <select
          key={projectId}
          id="timesheet-project"
          name="project"
          defaultValue={projectId}
          className={ui.input}
        >
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.archived ? `${project.name} (Archived)` : project.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0 flex-1">
        <label htmlFor="timesheet-client" className="sr-only">
          Filter by client
        </label>
        <select
          key={clientId}
          id="timesheet-client"
          name="client"
          defaultValue={clientId}
          className={ui.input}
        >
          <option value="">All clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.archived ? `${client.name} (Archived)` : client.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button type="submit" className={ui.secondaryButton}>
          Filter
        </button>
        {filtered ? (
          <Link
            href={timesheetsHref({ view, date })}
            className={ui.secondaryButton}
          >
            {timeCopy.clearFilters}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
