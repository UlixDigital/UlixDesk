import { authorizeApiRequest, jsonApi, optionsResponse } from "@/lib/api-auth";
import { apiCodes, apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { timeCopy } from "@/lib/time-copy";
import { todoCopy } from "@/lib/todo-copy";
import { createTodo, listPickerTodos } from "@/lib/todos";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  const actor = await authorizeApiRequest(request, { requireJson: false });
  if (actor instanceof Response) return actor;
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, role: true },
  });
  if (!user) return jsonApi(request, apiError(timeCopy.invalidJson, apiCodes.AUTH_REQUIRED), 401);
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
  const todos = await listPickerTodos(user);
  const visible = projectId ? todos.filter((todo) => todo.projectId === projectId) : todos;
  return jsonApi(request, { todos: visible });
}

export async function POST(request: Request) {
  const actor = await authorizeApiRequest(request, { requireJson: true });
  if (actor instanceof Response) return actor;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonApi(request, apiError(timeCopy.invalidJsonBody, apiCodes.INVALID_JSON), 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonApi(request, apiError(timeCopy.invalidJson, apiCodes.INVALID_JSON), 400);
  }
  const record = body as Record<string, unknown>;
  if (typeof record.projectId !== "string" || typeof record.title !== "string") {
    return jsonApi(request, apiError(timeCopy.invalidJson, apiCodes.INVALID_JSON), 400);
  }
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { id: true, role: true },
  });
  if (!user) return jsonApi(request, apiError(timeCopy.invalidJson, apiCodes.AUTH_REQUIRED), 401);
  const created = await createTodo({
    actor: user,
    projectId: record.projectId,
    title: record.title,
    description: null,
    assigneeIds: null,
  });
  if (!created.ok) {
    const status = created.error === todoCopy.projectMissing ? 404 : 400;
    const code = created.error === todoCopy.projectMissing ? apiCodes.PROJECT_NOT_FOUND : apiCodes.TODO_INVALID;
    return jsonApi(request, apiError(created.error, code), status);
  }
  return jsonApi(
    request,
    { todo: { id: created.todo.id, projectId: created.todo.projectId, title: created.todo.title } },
    201,
  );
}
