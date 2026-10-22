"use server";

import { revalidatePath } from "next/cache";
import { gateMutation } from "@/lib/auth";
import { todoCopy } from "@/lib/todo-copy";
import {
  createTodo,
  deleteTodo,
  setTodoArchived,
  setTodoStatus,
  updateTodo,
} from "@/lib/todos";

export type TodoActionState = { error: string | null; notice: string | null };

function revalidateTodos(projectId: string) {
  revalidatePath(`/projects/${projectId}/todos`);
  revalidatePath(`/projects/${projectId}/edit`);
  revalidatePath("/timesheets", "layout");
  revalidatePath("/reports", "layout");
}

function ids(formData: FormData) {
  return formData.getAll("assigneeId").map(String);
}

export async function createPickerTodoAction(
  projectId: string,
  title: string,
): Promise<{ ok: true; todo: { id: string; projectId: string; title: string } } | { ok: false; error: string }> {
  const gate = await gateMutation();
  if (!gate.ok) return { ok: false, error: gate.error };
  const created = await createTodo({
    actor: gate.user,
    projectId,
    title,
    description: null,
    assigneeIds: null,
  });
  if (!created.ok) return created;
  revalidateTodos(created.todo.projectId);
  return {
    ok: true,
    todo: { id: created.todo.id, projectId: created.todo.projectId, title: created.todo.title },
  };
}

export async function todoAction(
  _previous: TodoActionState,
  formData: FormData,
): Promise<TodoActionState> {
  const gate = await gateMutation();
  if (!gate.ok) return { error: gate.error, notice: null };
  const intent = String(formData.get("intent") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const id = String(formData.get("id") ?? "");
  try {
    if (intent === "create" || intent === "save") {
      const input = {
        actor: gate.user,
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        assigneeIds: formData.has("assigneeId") || formData.has("assignees") ? ids(formData) : null,
      };
      const saved =
        intent === "create"
          ? await createTodo({ ...input, projectId })
          : await updateTodo({ ...input, id });
      if (!saved.ok) return { error: saved.error, notice: null };
      revalidateTodos(saved.todo.projectId);
      return { error: null, notice: intent === "create" ? "Added." : "Saved." };
    }
    if (intent === "done" || intent === "reopen") {
      const saved = await setTodoStatus({
        actor: gate.user,
        id,
        status: intent === "done" ? "done" : "open",
      });
      if (!saved.ok) return { error: saved.error, notice: null };
      revalidateTodos(saved.todo.projectId);
      return { error: null, notice: intent === "done" ? "Marked done." : "Reopened." };
    }
    if (intent === "archive" || intent === "restore") {
      const saved = await setTodoArchived({
        actor: gate.user,
        id,
        archived: intent === "archive",
      });
      if (!saved.ok) return { error: saved.error, notice: null };
      revalidateTodos(saved.todo.projectId);
      return { error: null, notice: intent === "archive" ? "Archived." : "Restored." };
    }
    if (intent === "delete") {
      const deleted = await deleteTodo(gate.user, id);
      if (!deleted.ok) return { error: deleted.error, notice: null };
      revalidateTodos(deleted.projectId);
      return { error: null, notice: "Deleted." };
    }
    return { error: todoCopy.saveFailed, notice: null };
  } catch (error) {
    console.error("Failed to save to-do", error);
    return { error: todoCopy.saveFailed, notice: null };
  }
}
