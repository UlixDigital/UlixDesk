"use client";

import { useActionState } from "react";
import { todoAction, type TodoActionState } from "@/app/projects/todo-actions";
import { cn } from "@/lib/cn";
import { todoCopy } from "@/lib/todo-copy";
import { ui } from "@/lib/ui";

type TodoView = {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "done";
  archivedAt: string | null;
  assignees: Array<{ id: string; name: string }>;
  timeCount: number;
};

const idle: TodoActionState = { error: null, notice: null };

export function ProjectTodos({
  projectId,
  todos,
  people,
  canAssign,
  actorId,
}: {
  projectId: string;
  todos: TodoView[];
  people: Array<{ id: string; name: string }>;
  canAssign: boolean;
  actorId: string;
}) {
  return (
    <div className="space-y-6">
      <TodoEditor
        projectId={projectId}
        intent="create"
        canAssign={canAssign}
        people={people}
        actorId={actorId}
        submitLabel={todoCopy.add}
      />
      {todos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600">
          {todoCopy.empty}
        </p>
      ) : (
        <ul className="space-y-4">
          {todos.map((todo) => (
            <li key={todo.id}>
              <TodoEditor
                projectId={projectId}
                intent="save"
                todo={todo}
                canAssign={canAssign}
                people={people}
                actorId={actorId}
                submitLabel={todoCopy.save}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TodoEditor({
  projectId,
  intent,
  todo,
  canAssign,
  people,
  actorId,
  submitLabel,
}: {
  projectId: string;
  intent: "create" | "save";
  todo?: TodoView;
  canAssign: boolean;
  people: Array<{ id: string; name: string }>;
  actorId: string;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(todoAction, idle);
  const selected = new Set(todo ? todo.assignees.map((person) => person.id) : [actorId]);
  const status = todo?.archivedAt ? todoCopy.archived : todo?.status === "done" ? todoCopy.done : todoCopy.open;
  const titleId = todo ? `todo-title-${todo.id}` : "todo-title";
  const descriptionId = todo ? `todo-description-${todo.id}` : "todo-description";

  return (
    <form
      action={action}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:p-6"
    >
      <input type="hidden" name="projectId" value={projectId} readOnly />
      <input type="hidden" name="intent" defaultValue={intent} />
      {todo ? <input type="hidden" name="id" value={todo.id} readOnly /> : null}
      {canAssign ? <input type="hidden" name="assignees" value="1" readOnly /> : null}
      {state.error ? (
        <p role="alert" className="mb-4 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p role="status" className="mb-4 text-sm text-emerald-800">
          {state.notice}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{todo ? todo.title : todoCopy.add}</h2>
        {todo ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {status}
          </span>
        ) : null}
      </div>
      <div className="mt-4 grid gap-4">
        <label className="block text-sm font-medium text-slate-800" htmlFor={titleId}>
          {todoCopy.titleLabel}
          <input
            id={titleId}
            name="title"
            required
            maxLength={200}
            defaultValue={todo?.title ?? ""}
            className={cn(ui.input, "mt-1.5")}
          />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor={descriptionId}>
          {todoCopy.descriptionLabel}
          <span className="ml-2 text-xs font-normal text-slate-500">{todoCopy.descriptionHint}</span>
          <textarea
            id={descriptionId}
            name="description"
            rows={2}
            maxLength={2000}
            defaultValue={todo?.description ?? ""}
            className={cn(ui.input, "mt-1.5 min-h-16 resize-y")}
          />
        </label>
        {canAssign ? (
          <fieldset>
            <legend className="text-sm font-medium text-slate-800">{todoCopy.assigneesLabel}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {people.map((person) => (
                <label key={person.id} className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    name="assigneeId"
                    value={person.id}
                    defaultChecked={selected.has(person.id)}
                  />
                  {person.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="text-sm text-slate-600">
            {todoCopy.assignedToYou}
            {todo && todo.assignees.length > 0
              ? ` ${todo.assignees.map((person) => person.name).join(", ")}.`
              : ""}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          className={ui.primaryButton}
          disabled={pending}
          onClick={(event) => setTodoIntent(event.currentTarget.form, intent)}
        >
          {pending ? todoCopy.saving : submitLabel}
        </button>
        {todo ? (
          <>
            <button
              type="submit"
              className={ui.secondaryButton}
              disabled={pending}
              onClick={(event) =>
                setTodoIntent(event.currentTarget.form, todo.status === "done" ? "reopen" : "done")
              }
            >
              {todo.status === "done" ? todoCopy.reopen : todoCopy.markDone}
            </button>
            <button
              type="submit"
              className={ui.secondaryButton}
              disabled={pending}
              onClick={(event) =>
                setTodoIntent(event.currentTarget.form, todo.archivedAt ? "restore" : "archive")
              }
            >
              {todo.archivedAt ? todoCopy.restore : todoCopy.archive}
            </button>
            <button
              type="submit"
              className={ui.quietDangerButton}
              disabled={pending || todo.timeCount > 0}
              title={todo.timeCount > 0 ? todoCopy.deleteBlocked : undefined}
              onClick={(event) => setTodoIntent(event.currentTarget.form, "delete")}
            >
              {todoCopy.delete}
            </button>
          </>
        ) : null}
      </div>
      {todo && todo.timeCount > 0 ? (
        <p className="mt-3 text-xs text-slate-500">{todoCopy.deleteBlocked}</p>
      ) : null}
    </form>
  );
}

function setTodoIntent(form: HTMLFormElement | null, intent: string) {
  const field = form?.elements.namedItem("intent");
  if (field instanceof HTMLInputElement) field.value = intent;
}
