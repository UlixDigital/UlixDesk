"use client";

import Link from "next/link";
import { SearchIcon } from "@/components/icons";
import {
  projectsHref,
  type ClientOption,
  type ProjectStatus,
} from "@/lib/project-display";
import { ui } from "@/lib/ui";

export function ProjectFilters({
  status,
  query,
  clientId,
  clients,
}: {
  status: ProjectStatus;
  query: string;
  clientId: string;
  clients: ClientOption[];
}) {
  const filtered = Boolean(query || clientId);

  return (
    <form
      role="search"
      action="/projects"
      method="get"
      className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center"
      onChange={(event) => {
        if ((event.target as HTMLElement).id === "project-client-filter") {
          event.currentTarget.requestSubmit();
        }
      }}
    >
      {status === "archived" ? (
        <input type="hidden" name="status" value="archived" readOnly />
      ) : null}
      <div className="relative min-w-0 flex-1">
        <label htmlFor="project-search" className="sr-only">
          Search projects by name
        </label>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          key={query}
          id="project-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search by name"
          autoComplete="off"
          className={`${ui.input} pl-9`}
        />
      </div>
      <div className="sm:w-64">
        <label htmlFor="project-client-filter" className="sr-only">
          Filter by client
        </label>
        <select
          key={clientId}
          id="project-client-filter"
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
          Search
        </button>
        {filtered ? (
          <Link href={projectsHref(status)} className={ui.secondaryButton}>
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
