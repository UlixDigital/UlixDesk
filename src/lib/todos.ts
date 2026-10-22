import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  TODO_DESCRIPTION_MAX,
  TODO_TITLE_MAX,
  todoCopy,
} from "@/lib/todo-copy";
import { canManageWorkspace } from "@/lib/users-validation";

/**
 * Owners and admins see every to-do. Everyone else sees to-dos they created
 * or are assigned to.
 *
 * There is no manager role. `User.role` is owner, admin, or member, and
 * Project has no manager relation, so a "manager" is not elevated.
 */
export function todoVisibilityWhere(actor: { id: string; role: string }): Prisma.TodoWhereInput {
  if (canManageWorkspace(actor.role)) return {};
  return {
    OR: [{ createdById: actor.id }, { assignees: { some: { userId: actor.id } } }],
  };
}

/** Owners and admins may assign any active workspace user. Members cannot. */
export function canAssignTodos(role: string) {
  return canManageWorkspace(role);
}

/**
 * Owners and admins can change any to-do. A member can change a to-do only
 * when they created it. An assigned member can still mark it done or reopen it.
 */
export function canEditTodo(actor: { id: string; role: string }, createdById: string) {
  return canAssignTodos(actor.role) || actor.id === createdById;
}

export type TodoPerson = { id: string; name: string };

export type TodoRecord = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: "open" | "done";
  archivedAt: Date | null;
  createdById: string;
  assignees: TodoPerson[];
  timeCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PickerTodo = { id: string; projectId: string; title: string };

export type ReportTodoOption = {
  id: string;
  projectId: string;
  title: string;
  name: string;
};

const todoInclude = {
  assignees: {
    select: {
      userId: true,
      user: { select: { id: true, name: true } },
    },
  },
  _count: { select: { timeEntries: true } },
} as const;

type TodoRow = Prisma.TodoGetPayload<{ include: typeof todoInclude }>;

function toRecord(row: TodoRow): TodoRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    status: row.status === "done" ? "done" : "open",
    archivedAt: row.archivedAt,
    createdById: row.createdById,
    assignees: [...row.assignees]
      .sort((a, b) => a.user.name.localeCompare(b.user.name, "en", { sensitivity: "base" }))
      .map((assignee) => ({ id: assignee.user.id, name: assignee.user.name })),
    timeCount: row._count.timeEntries,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function cleanTodoTitle(raw: string) {
  const title = raw.replace(/\s+/g, " ").trim();
  if (!title) return { ok: false as const, error: todoCopy.titleRequired };
  if (title.length > TODO_TITLE_MAX) return { ok: false as const, error: todoCopy.titleTooLong };
  return { ok: true as const, title };
}

export function cleanTodoDescription(raw: string | null | undefined) {
  if (raw == null) return { ok: true as const, description: null as string | null };
  const description = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!description) return { ok: true as const, description: null };
  if (description.length > TODO_DESCRIPTION_MAX) {
    return { ok: false as const, error: todoCopy.descriptionTooLong };
  }
  return { ok: true as const, description };
}

/** Open to-dos whose title contains the query. Blank query returns every row. */
export function pickerMatches<T extends { title: string }>(todos: T[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return todos;
  return todos.filter((todo) => todo.title.toLowerCase().includes(needle));
}

/** Case-insensitive exact title, used so typing an existing to-do reuses it. */
export function exactTodoMatch<T extends { title: string }>(todos: T[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  return todos.find((todo) => todo.title.toLowerCase() === needle) ?? null;
}

/**
 * Projects have no membership list. Anyone who can sign in can be assigned,
 * which is the workspace stand-in for a project member.
 */
async function resolveAssignees(
  actor: { id: string; role: string },
  requested: string[] | null,
) {
  const ids = [
    ...new Set((requested && requested.length > 0 ? requested : [actor.id]).map((id) => id.trim()).filter(Boolean)),
  ];
  if (ids.length === 0) return { ok: false as const, error: todoCopy.assigneeRequired };
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, deactivatedAt: null },
    select: { id: true },
  });
  if (users.length !== ids.length) return { ok: false as const, error: todoCopy.assigneeInvalid };
  return { ok: true as const, ids };
}

export async function createTodo(input: {
  actor: { id: string; role: string };
  projectId: string;
  title: string;
  description?: string | null;
  assigneeIds?: string[] | null;
}) {
  const title = cleanTodoTitle(input.title);
  if (!title.ok) return title;
  const description = cleanTodoDescription(input.description);
  if (!description.ok) return description;
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true },
  });
  if (!project) return { ok: false as const, error: todoCopy.projectMissing };
  const assignees = canAssignTodos(input.actor.role)
    ? await resolveAssignees(input.actor, input.assigneeIds ?? null)
    : { ok: true as const, ids: [input.actor.id] };
  if (!assignees.ok) return assignees;
  const row = await prisma.todo.create({
    data: {
      projectId: project.id,
      title: title.title,
      description: description.description,
      status: "open",
      createdById: input.actor.id,
      assignees: { create: assignees.ids.map((userId) => ({ userId })) },
    },
    include: todoInclude,
  });
  return { ok: true as const, todo: toRecord(row) };
}

async function visibleTodo(actor: { id: string; role: string }, id: string) {
  return prisma.todo.findFirst({
    where: { id, ...todoVisibilityWhere(actor) },
    include: todoInclude,
  });
}

export async function updateTodo(input: {
  actor: { id: string; role: string };
  id: string;
  title: string;
  description?: string | null;
  assigneeIds?: string[] | null;
}) {
  const existing = await visibleTodo(input.actor, input.id);
  if (!existing) return { ok: false as const, error: todoCopy.notFound };
  if (!canEditTodo(input.actor, existing.createdById)) {
    return { ok: false as const, error: todoCopy.editDenied };
  }
  const title = cleanTodoTitle(input.title);
  if (!title.ok) return title;
  const description = cleanTodoDescription(input.description);
  if (!description.ok) return description;
  const keepAssignees = !canAssignTodos(input.actor.role) || input.assigneeIds == null;
  const assignees = keepAssignees
    ? { ok: true as const, ids: existing.assignees.map((assignee) => assignee.userId) }
    : await resolveAssignees(input.actor, input.assigneeIds ?? null);
  if (!assignees.ok) return assignees;
  const row = await prisma.$transaction(async (tx) => {
    await tx.todoAssignee.deleteMany({ where: { todoId: existing.id } });
    return tx.todo.update({
      where: { id: existing.id },
      data: {
        title: title.title,
        description: description.description,
        assignees: { create: assignees.ids.map((userId) => ({ userId })) },
      },
      include: todoInclude,
    });
  });
  return { ok: true as const, todo: toRecord(row) };
}

export async function setTodoStatus(input: {
  actor: { id: string; role: string };
  id: string;
  status: "open" | "done";
}) {
  const existing = await visibleTodo(input.actor, input.id);
  if (!existing) return { ok: false as const, error: todoCopy.notFound };
  const row = await prisma.todo.update({
    where: { id: existing.id },
    data: { status: input.status },
    include: todoInclude,
  });
  return { ok: true as const, todo: toRecord(row) };
}

export async function setTodoArchived(input: {
  actor: { id: string; role: string };
  id: string;
  archived: boolean;
}) {
  const existing = await visibleTodo(input.actor, input.id);
  if (!existing) return { ok: false as const, error: todoCopy.notFound };
  if (!canEditTodo(input.actor, existing.createdById)) {
    return { ok: false as const, error: todoCopy.editDenied };
  }
  const row = await prisma.todo.update({
    where: { id: existing.id },
    data: { archivedAt: input.archived ? new Date() : null },
    include: todoInclude,
  });
  return { ok: true as const, todo: toRecord(row) };
}

export async function deleteTodo(actor: { id: string; role: string }, id: string) {
  const existing = await visibleTodo(actor, id);
  if (!existing) return { ok: false as const, error: todoCopy.notFound };
  if (!canEditTodo(actor, existing.createdById)) {
    return { ok: false as const, error: todoCopy.editDenied };
  }
  if (existing._count.timeEntries > 0) return { ok: false as const, error: todoCopy.deleteBlocked };
  await prisma.todo.delete({ where: { id: existing.id } });
  return { ok: true as const, projectId: existing.projectId };
}

export async function listProjectTodos(actor: { id: string; role: string }, projectId: string) {
  const rows = await prisma.todo.findMany({
    where: { projectId, ...todoVisibilityWhere(actor) },
    include: todoInclude,
  });
  return rows
    .map(toRecord)
    .sort((a, b) => {
      const rank = (todo: TodoRecord) => (todo.archivedAt ? 2 : todo.status === "done" ? 1 : 0);
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      const byTitle = a.title.localeCompare(b.title, "en", { sensitivity: "base" });
      if (byTitle !== 0) return byTitle;
      return a.id.localeCompare(b.id);
    });
}

/** Open, unarchived to-dos the actor may reuse on a timer or a new entry. */
export async function listPickerTodos(actor: { id: string; role: string }): Promise<PickerTodo[]> {
  const rows = await prisma.todo.findMany({
    where: { status: "open", archivedAt: null, ...todoVisibilityWhere(actor) },
    select: { id: true, projectId: true, title: true },
  });
  return rows.sort((a, b) => {
    const byTitle = a.title.localeCompare(b.title, "en", { sensitivity: "base" });
    if (byTitle !== 0) return byTitle;
    return a.id.localeCompare(b.id);
  });
}

export async function listReportTodoOptions(actor: { id: string; role: string }): Promise<ReportTodoOption[]> {
  const rows = await prisma.todo.findMany({
    where: todoVisibilityWhere(actor),
    select: { id: true, projectId: true, title: true, status: true, archivedAt: true },
  });
  return rows
    .map((row) => {
      const suffix = row.archivedAt ? ` (${todoCopy.archived})` : row.status === "done" ? ` (${todoCopy.done})` : "";
      return { id: row.id, projectId: row.projectId, title: row.title, name: `${row.title}${suffix}` };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id));
}

/**
 * A new selection must be an open, unarchived to-do the actor can see on
 * this project. The entry's current to-do stays valid when it is done,
 * archived, or no longer visible, so old time keeps it.
 */
export class TodoUnavailableError extends Error {
  constructor() {
    super(todoCopy.unavailable);
    this.name = "TodoUnavailableError";
  }
}

export async function resolveTodoForEntry(
  input: {
    actorId: string;
    projectId: string;
    todoId: string | null;
    currentTodoId?: string | null;
  },
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const requested = input.todoId?.trim() || null;
  if (!requested) return { ok: true as const, todoId: null as string | null };
  const actor = await db.user.findUnique({
    where: { id: input.actorId },
    select: { id: true, role: true },
  });
  if (!actor) return { ok: false as const, error: todoCopy.unavailable };
  const keeping = requested === (input.currentTodoId ?? null);
  const todo = await db.todo.findFirst({
    where: {
      id: requested,
      projectId: input.projectId,
      ...(keeping ? {} : { status: "open", archivedAt: null, ...todoVisibilityWhere(actor) }),
    },
    select: { id: true },
  });
  if (!todo) return { ok: false as const, error: todoCopy.unavailable };
  return { ok: true as const, todoId: todo.id };
}

/**
 * Use the selected to-do, or save a typed title so the next timer can reuse it.
 * An exact title match is reused instead of creating a duplicate.
 */
export async function todoIdForTime(input: {
  actor: { id: string; role: string };
  projectId: string;
  todoId: string | null;
  draftTitle: string | null;
  currentTodoId?: string | null;
}) {
  let todoId = input.todoId?.trim() || null;
  const draft = input.draftTitle?.trim() || "";
  if (!todoId && draft) {
    const open = await listPickerTodos(input.actor);
    const match = exactTodoMatch(
      open.filter((todo) => todo.projectId === input.projectId),
      draft,
    );
    if (match) {
      todoId = match.id;
    } else {
      const created = await createTodo({
        actor: input.actor,
        projectId: input.projectId,
        title: draft,
        description: null,
        assigneeIds: null,
      });
      if (!created.ok) return created;
      todoId = created.todo.id;
    }
  }
  return resolveTodoForEntry({
    actorId: input.actor.id,
    projectId: input.projectId,
    todoId,
    currentTodoId: input.currentTodoId,
  });
}
