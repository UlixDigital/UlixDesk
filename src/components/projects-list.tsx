import Link from "next/link";
import { ArchiveButton, RestoreButton } from "@/components/project-row-actions";
import { StatusBadge } from "@/components/status-badge";
import type { ProjectRecord } from "@/lib/projects";
import { ui } from "@/lib/ui";

const columns =
  "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_4.75rem_auto] sm:items-center sm:gap-4";

export function ProjectsList({
  projects,
  archived,
}: {
  projects: ProjectRecord[];
  archived: boolean;
}) {
  return (
    <section aria-label={archived ? "Archived projects" : "Active projects"}>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]">
        <div
          aria-hidden="true"
          className={`hidden border-b border-slate-200 px-5 py-2 text-xs font-medium text-slate-500 sm:grid ${columns}`}
        >
          <span>Project</span>
          <span>Client</span>
          <span>Billable</span>
          <span />
        </div>
        <ul className="divide-y divide-slate-200">
          {projects.map((project) => (
            <li
              key={project.id}
              className={`grid grid-cols-1 gap-3 px-4 py-4 sm:px-5 ${columns}`}
            >
              <div className="min-w-0">
                <Link
                  href={`/projects/${project.id}/edit`}
                  className="text-base font-semibold break-words text-slate-900 hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                >
                  {project.name}
                  <span className="sr-only">, edit project</span>
                </Link>
                {project.description ? (
                  <p className="mt-1 line-clamp-2 text-sm break-words text-slate-600">
                    {project.description}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 sm:sr-only">
                  Client
                </p>
                {project.client ? (
                  <span className="mt-1 inline-flex flex-wrap items-center gap-2 sm:mt-0">
                    <Link
                      href={`/clients/${project.client.id}/edit`}
                      className="text-sm font-medium break-words text-slate-800 hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                    >
                      {project.client.name}
                    </Link>
                    {project.client.archivedAt ? (
                      <StatusBadge status="Archived" />
                    ) : null}
                  </span>
                ) : (
                  <p className="mt-1 text-sm text-slate-500 sm:mt-0">No client</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 sm:sr-only">
                  Billable
                </p>
                <p className="mt-1 text-sm text-slate-700 sm:mt-0">
                  {project.billable ? "Yes" : "No"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                <Link
                  href={`/projects/${project.id}/edit`}
                  className={ui.secondaryButton}
                >
                  Edit
                  <span className="sr-only"> {project.name}</span>
                </Link>
                {archived ? (
                  <RestoreButton id={project.id} name={project.name} />
                ) : (
                  <ArchiveButton id={project.id} name={project.name} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
