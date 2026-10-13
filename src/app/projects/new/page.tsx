import type { Metadata } from "next";
import { ProjectForm } from "@/components/project-form";
import { PermissionNote } from "@/components/permission-note";
import { saveProjectAction } from "@/app/projects/actions";
import { authCopy } from "@/lib/auth-copy";
import type { ClientOption } from "@/lib/project-display";
import { listClientChoices } from "@/lib/projects";
import { emptyProjectFormValues } from "@/lib/project-validation";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";

export const metadata: Metadata = {
  title: "New project",
};

export default async function NewProjectPage() {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) {
    return <PermissionNote message={authCopy.manageDenied} />;
  }
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
