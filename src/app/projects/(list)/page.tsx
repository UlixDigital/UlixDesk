import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "@/components/icons";
import { ProjectEmptyState } from "@/components/project-empty-state";
import { ProjectFilters } from "@/components/project-filters";
import { ProjectsList } from "@/components/projects-list";
import { cn } from "@/lib/cn";
import {
  emptyProjectStateKind,
  matchingProjectsLabel,
  parseProjectStatus,
  projectCountLabel,
  projectsHref,
  type ClientOption,
} from "@/lib/project-display";
import { countProjectsByStatus, listClientsForFilter, loadProjectLists } from "@/lib/projects";
import { ui } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; client?: string }>;
}) {
  const params = await searchParams;
  const status = parseProjectStatus(params.status);
  const query = (params.q ?? "").trim();
  const requestedClientId = (params.client ?? "").trim();
  const filterClients = await listClientsForFilter();
  const selectedClient =
    filterClients.find((client) => client.id === requestedClientId) ?? null;
  const clientId = selectedClient?.id ?? "";
  const [lists, totals] = await Promise.all([
    loadProjectLists(query, clientId),
    countProjectsByStatus(),
  ]);
  const projects = lists[status];
  const empty = emptyProjectStateKind({
    status,
    query,
    clientId,
    visibleCount: projects.length,
    otherCount: status === "active" ? totals.archived : totals.active,
  });
  const clients: ClientOption[] = filterClients.map((client) => ({
    id: client.id,
    name: client.name,
    archived: client.archivedAt !== null,
  }));

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Projects
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Work you track time against.
          </p>
        </div>
        <Link href="/projects/new" className={ui.primaryButton}>
          <PlusIcon className="h-4 w-4" />
          Add project
        </Link>
      </div>

      <ProjectFilters
        status={status}
        query={query}
        clientId={clientId}
        clients={clients}
      />

      <div className="mt-6 border-b border-slate-200">
        <nav aria-label="Project status" className="-mb-px flex gap-6">
          <StatusTab
            href={projectsHref("active", query, clientId)}
            label="Active"
            count={totals.active}
            current={status === "active"}
          />
          <StatusTab
            href={projectsHref("archived", query, clientId)}
            label="Archived"
            count={totals.archived}
            current={status === "archived"}
          />
        </nav>
      </div>

      {(query || selectedClient) && projects.length > 0 ? (
        <p role="status" className="mt-4 text-sm text-slate-600">
          {matchingProjectsLabel(projects.length, query, selectedClient?.name)}
        </p>
      ) : null}

      {empty ? (
        <ProjectEmptyState
          kind={empty}
          query={query}
          clientId={clientId}
          status={status}
        />
      ) : (
        <ProjectsList projects={projects} archived={status === "archived"} />
      )}
    </div>
  );
}

function StatusTab({
  href,
  label,
  count,
  current,
}: {
  href: string;
  label: string;
  count: number;
  current: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700",
        current
          ? "border-teal-700 text-teal-800"
          : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900",
      )}
    >
      {label}
      <span className="sr-only">, {projectCountLabel(count)}</span>
      <span
        aria-hidden="true"
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-semibold",
          current ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600",
        )}
      >
        {count}
      </span>
    </Link>
  );
}
