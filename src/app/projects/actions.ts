"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { projectsHref } from "@/lib/project-display";
import {
  archiveProject,
  clientAssignmentError,
  createProject,
  getProject,
  restoreProject,
  updateProject,
} from "@/lib/projects";
import {
  parseProjectFormData,
  validateProjectInput,
  type ProjectFormState,
} from "@/lib/project-validation";

function revalidateProjectViews(clientIds: Array<string | null>) {
  revalidatePath("/projects");
  const seen = new Set<string>();
  for (const clientId of clientIds) {
    if (!clientId || seen.has(clientId)) continue;
    seen.add(clientId);
    revalidatePath(`/clients/${clientId}/edit`);
  }
}

export async function saveProjectAction(
  _previous: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const values = parseProjectFormData(formData);
  const result = validateProjectInput(values);
  if (!result.ok) {
    return { errors: result.errors, values: result.values };
  }

  const id = String(formData.get("id") ?? "");

  if (!id) {
    const clientError = await clientAssignmentError(result.data.clientId, null);
    if (clientError) {
      return { errors: { clientId: clientError }, values };
    }
    try {
      await createProject(result.data);
    } catch (error) {
      console.error("Failed to create project", error);
      return {
        errors: {
          form: "Something went wrong saving this project. Try again.",
        },
        values,
      };
    }
    revalidateProjectViews([result.data.clientId]);
    redirect("/projects");
  }

  const existing = await getProject(id);
  if (!existing) {
    return {
      errors: { form: "This project no longer exists." },
      values,
    };
  }

  const clientError = await clientAssignmentError(
    result.data.clientId,
    existing.clientId,
  );
  if (clientError) {
    return { errors: { clientId: clientError }, values };
  }

  try {
    const updated = await updateProject(id, result.data);
    if (!updated) {
      return {
        errors: { form: "This project no longer exists." },
        values,
      };
    }
  } catch (error) {
    console.error("Failed to update project", error);
    return {
      errors: {
        form: "Something went wrong saving this project. Try again.",
      },
      values,
    };
  }

  revalidateProjectViews([existing.clientId, result.data.clientId]);
  redirect(projectsHref(existing.archivedAt ? "archived" : "active"));
}

export async function archiveProjectAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const archived = await archiveProject(id);
  revalidateProjectViews([archived?.clientId ?? null]);
}

export async function restoreProjectAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const restored = await restoreProject(id);
  revalidateProjectViews([restored?.clientId ?? null]);
}
