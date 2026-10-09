import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { saveProjectAction } from "@/app/projects/actions";
import { ProjectForm } from "@/components/project-form";
import { RestoreButton } from "@/components/project-row-actions";
import { projectsHref, type ClientOption } from "@/lib/project-display";
import { getProject, listClientChoices } from "@/lib/projects";

type EditPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: EditPageProps): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  return { title: project ? `Edit ${project.name}` : "Project not found" };
}

export default async function EditProjectPage({ params }: EditPageProps) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const choices = await listClientChoices(project.clientId);
  const clients: ClientOption[] = choices.map((client) => ({
    id: client.id,
    name: client.name,
    archived: client.archivedAt !== null,
  }));
  const archived = project.archivedAt !== null;

  return (
    <ProjectForm
      key={project.id}
      action={saveProjectAction}
      projectId={project.id}
      clients={clients}
      initialState={{
        errors: {},
        values: {
          name: project.name,
          description: project.description ?? "",
          clientId: project.clientId ?? "",
          billable: project.billable,
        },
      }}
      title="Edit project"
      description={`Update details for ${project.name}.`}
      submitLabel="Save changes"
      cancelHref={projectsHref(archived ? "archived" : "active")}
      badge={archived ? "Archived" : "Active"}
      banner={
        archived ? (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-950">
              This project is archived. Restore it to show this project on the
              Active tab.
            </p>
            <RestoreButton id={project.id} name={project.name} />
          </div>
        ) : null
      }
    />
  );
}
