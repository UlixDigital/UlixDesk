import type { Metadata } from "next";
import { ProjectForm } from "@/components/project-form";
import { saveProjectAction } from "@/app/projects/actions";
import type { ClientOption } from "@/lib/project-display";
import { listClientChoices } from "@/lib/projects";
import { emptyProjectFormValues } from "@/lib/project-validation";

export const metadata: Metadata = {
  title: "New project",
};

export default async function NewProjectPage() {
  const clients = await listClientChoices(null);
  const options: ClientOption[] = clients.map((client) => ({
    id: client.id,
    name: client.name,
    archived: client.archivedAt !== null,
  }));

  return (
    <ProjectForm
      action={saveProjectAction}
      initialState={{ errors: {}, values: emptyProjectFormValues }}
      clients={options}
      title="New project"
      description="Add work you track time against. A name is enough. It starts as billable, and you can link a client later."
      submitLabel="Create project"
      cancelHref="/projects"
      autoFocusName
    />
  );
}
