"use client";

import { useState, type ReactNode } from "react";
import { createPickerTodoAction } from "@/app/projects/todo-actions";
import { cn } from "@/lib/cn";
import { exactTodoMatch, pickerMatches, type PickerTodo } from "@/lib/todos";
import { todoAddLabel, todoCopy } from "@/lib/todo-copy";
import { ui } from "@/lib/ui";

type PinnedTodo = { id: string; projectId: string; title: string; label: string };

export function TodoPicker({
  idPrefix,
  projectId,
  todos,
  pinned = null,
  todoId,
  onTodoId,
  error,
}: {
  idPrefix: string;
  projectId: string;
  todos: PickerTodo[];
  pinned?: PinnedTodo | null;
  todoId: string;
  onTodoId: (todoId: string) => void;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState<PickerTodo[]>([]);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const searchId = `${idPrefix}-todo-search`;
  const listId = `${idPrefix}-todo-list`;
  const mine = [...todos, ...extra].filter(
    (todo, index, all) =>
      todo.projectId === projectId && all.findIndex((item) => item.id === todo.id) === index,
  );
  const matches = pickerMatches(mine, query);
  const exact = exactTodoMatch(mine, query);
  const typed = query.trim();
  const draft = !todoId && typed && !exact ? typed : "";
  const showPinned = Boolean(
    pinned &&
      pinned.projectId === projectId &&
      !mine.some((todo) => todo.id === pinned.id) &&
      (!query.trim() || pinned.title.toLowerCase().includes(query.trim().toLowerCase())),
  );
  if (!projectId) return null;

  async function addTodo() {
    const title = query.trim();
    if (!title || pending) return;
    setPending(true);
    setLocalError(null);
    const created = await createPickerTodoAction(projectId, title);
    setPending(false);
    if (!created.ok) {
      setLocalError(created.error);
      return;
    }
    setExtra((current) => [...current, created.todo]);
    onTodoId(created.todo.id);
    setQuery("");
  }

  const message = error || localError;

  return (
    <div className="min-w-0" data-testid={`${idPrefix}-todo-picker`}>
      <input type="hidden" name="todoId" value={todoId} readOnly />
      <input type="hidden" name="todoDraft" value={draft} readOnly />
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={searchId} className="text-sm font-medium text-slate-800">
          {todoCopy.pickerLabel}
        </label>
        <span className="text-xs text-slate-500">{todoCopy.pickerOptional}</span>
      </div>
      <input
        id={searchId}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setLocalError(null);
        }}
        placeholder={todoCopy.pickerSearch}
        aria-controls={listId}
        className={cn(ui.input, "mt-1.5", message && ui.inputError)}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? `${searchId}-error` : undefined}
      />
      <p className="mt-2 text-xs font-medium text-slate-500">{todoCopy.pickerMine}</p>
      <ul
        id={listId}
        role="listbox"
        aria-label={todoCopy.pickerMine}
        className="mt-1 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white"
      >
        <li>
          <PickerButton selected={todoId === ""} onClick={() => onTodoId("")}>
            {todoCopy.pickerNone}
          </PickerButton>
        </li>
        {showPinned && pinned ? (
          <li>
            <PickerButton selected={todoId === pinned.id} onClick={() => onTodoId(pinned.id)}>
              {pinned.title}
              <span className="ml-2 text-xs text-slate-500">{pinned.label}</span>
            </PickerButton>
          </li>
        ) : null}
        {matches.map((todo) => (
          <li key={todo.id}>
            <PickerButton
              selected={todoId === todo.id}
              onClick={() => {
                onTodoId(todo.id);
                setQuery("");
              }}
            >
              {todo.title}
            </PickerButton>
          </li>
        ))}
        {matches.length === 0 && !showPinned ? (
          <li className="px-3 py-2 text-sm text-slate-500">{todoCopy.pickerEmpty}</li>
        ) : null}
        {typed && !exact ? (
          <li>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-accent hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
              onClick={() => void addTodo()}
              disabled={pending}
            >
              <span>{todoAddLabel(typed)}</span>
              <span>{pending ? todoCopy.adding : todoCopy.pickerAdd}</span>
            </button>
          </li>
        ) : null}
      </ul>
      {message ? (
        <p id={`${searchId}-error`} role="alert" className="mt-2 text-sm text-rose-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function PickerButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
        selected ? "bg-primary-50 font-semibold text-ink" : "text-slate-800",
      )}
    >
      {children}
    </button>
  );
}
