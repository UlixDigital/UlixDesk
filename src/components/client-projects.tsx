import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { clientProjectsEmptyCopy, projectCountLabel } from "@/lib/project-display";
import type { ClientProjectSummary } from "@/lib/projects";

export function ClientProjects({
  clientName,
  projects,
}: {
  clientName: string;
  projects: ClientProjectSummary[];
}) {
  const empty = clientProjectsEmptyCopy(clientName);

  return (
    <section aria-label={`Projects for ${clientName}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Projects</h2>
        {projects.length > 0 ? (
          <p className="text-sm text-slate-600">{projectCountLabel(projects.length)}</p>
        ) : null}
      </div>
      {projects.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <h3 className="text-base font-semibold text-slate-900">{empty.title}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            {empty.body}
          </p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]">
          {projects.map((project) => (
            <li
              key={project.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <Link
                href={`/projects/${project.id}/edit`}
                className="min-w-0 text-sm font-semibold break-words text-slate-900 hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                {project.name}
                <span className="sr-only">, edit project</span>
              </Link>
              {project.archivedAt ? <StatusBadge status="Archived" /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
