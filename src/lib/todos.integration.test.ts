import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createProject } from "@/lib/projects";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createTestUser } from "@/lib/test-actor";
import { createManualEntry, startTimer, updateManualEntry } from "@/lib/time-entries";
import { todoCopy } from "@/lib/todo-copy";
import {
  createTodo,
  deleteTodo,
  listPickerTodos,
  listProjectTodos,
  resolveTodoForEntry,
  setTodoArchived,
  setTodoStatus,
  TodoUnavailableError,
  todoIdForTime,
  updateTodo,
} from "@/lib/todos";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function project(name = "Website") {
  return createProject({ name, description: null, clientId: null, billable: true });
}

const now = new Date("2026-10-22T12:00:00.000Z");

function entryInput(projectId: string, todoId?: string | null) {
  return {
    projectId,
    startedAt: new Date("2026-10-22T09:00:00.000Z"),
    endedAt: new Date("2026-10-22T10:00:00.000Z"),
    billable: true,
    note: null,
    ...(todoId !== undefined ? { todoId } : {}),
  };
}

describe("to-do permissions", () => {
  it("shows a member only their own to-dos and blocks everyone else from reusing them", async () => {
    const site = await project();
    const member = await createTestUser("member", "member-todos@ulix.test");
    const other = await createTestUser("member", "other-todos@ulix.test");
    const created = await createTodo({
      actor: member,
      projectId: site.id,
      title: "Write the brief",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.todo.assignees.map((person) => person.id)).toEqual([member.id]);

    expect((await listProjectTodos(member, site.id)).map((todo) => todo.id)).toEqual([created.todo.id]);
    expect(await listProjectTodos(other, site.id)).toEqual([]);
    expect((await listPickerTodos(other)).map((todo) => todo.id)).not.toContain(created.todo.id);

    const started = await startTimer({
      projectId: site.id,
      note: "",
      now,
      userId: other.id,
      todoId: created.todo.id,
    });
    expect(started).toMatchObject({ ok: false, code: "todo-unavailable" });

    await expect(
      createManualEntry(entryInput(site.id, created.todo.id), now, other.id),
    ).rejects.toBeInstanceOf(TodoUnavailableError);

    const own = await createManualEntry(entryInput(site.id), now, other.id);
    await expect(
      updateManualEntry(own.entry.id, entryInput(site.id, created.todo.id), now, other.id),
    ).rejects.toBeInstanceOf(TodoUnavailableError);
    expect((await prisma.timeEntry.findUnique({ where: { id: own.entry.id } }))?.todoId).toBeNull();
  });

  it("lets an assigned member reuse a to-do they did not create", async () => {
    const site = await project();
    const owner = await createTestUser("owner", "owner-todos@ulix.test");
    const member = await createTestUser("member", "assigned-todos@ulix.test");
    const created = await createTodo({
      actor: owner,
      projectId: site.id,
      title: "Shared task",
      assigneeIds: [member.id],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await listPickerTodos(member)).map((todo) => todo.id)).toEqual([created.todo.id]);

    const started = await startTimer({
      projectId: site.id,
      note: "",
      now,
      userId: member.id,
      todoId: created.todo.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.timer.todoId).toBe(created.todo.id);
  });

  it("lets owners and admins see every to-do and assign other active people", async () => {
    const site = await project();
    const owner = await createTestUser("owner", "see-owner@ulix.test");
    const admin = await createTestUser("admin", "see-admin@ulix.test");
    const member = await createTestUser("member", "see-member@ulix.test");
    const created = await createTodo({
      actor: member,
      projectId: site.id,
      title: "Member task",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect((await listProjectTodos(owner, site.id)).map((todo) => todo.id)).toEqual([created.todo.id]);
    expect((await listProjectTodos(admin, site.id)).map((todo) => todo.id)).toEqual([created.todo.id]);

    const assigned = await updateTodo({
      actor: admin,
      id: created.todo.id,
      title: "Member task",
      assigneeIds: [member.id, owner.id],
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    expect(assigned.todo.assignees.map((person) => person.id).sort()).toEqual(
      [member.id, owner.id].sort(),
    );

    const byOwner = await createTodo({
      actor: owner,
      projectId: site.id,
      title: "Owner task",
      assigneeIds: [admin.id],
    });
    expect(byOwner.ok).toBe(true);
    if (!byOwner.ok) return;
    expect(byOwner.todo.assignees.map((person) => person.id)).toEqual([admin.id]);
    expect((await listPickerTodos(admin)).map((todo) => todo.id)).toContain(byOwner.todo.id);
  });

  it("rejects a member who tries to assign someone else and does not save the to-do", async () => {
    const site = await project();
    const member = await createTestUser("member", "assign-member@ulix.test");
    const other = await createTestUser("member", "assign-other@ulix.test");
    const denied = await createTodo({
      actor: member,
      projectId: site.id,
      title: "Not theirs",
      assigneeIds: [other.id],
    });
    expect(denied).toEqual({ ok: false, error: todoCopy.assignDenied });
    expect(await prisma.todo.count()).toBe(0);

    const own = await createTodo({ actor: member, projectId: site.id, title: "Mine" });
    expect(own.ok).toBe(true);
    if (!own.ok) return;
    const edited = await updateTodo({
      actor: member,
      id: own.todo.id,
      title: "Mine",
      assigneeIds: [member.id, other.id],
    });
    expect(edited).toEqual({ ok: false, error: todoCopy.assignDenied });
    expect((await listProjectTodos(other, site.id))).toEqual([]);
  });

  it("hides done and archived to-dos from the picker but keeps them on an existing entry", async () => {
    const site = await project();
    const other = await project("Brochure");
    const member = await createTestUser("member", "picker-member@ulix.test");
    const created = await createTodo({ actor: member, projectId: site.id, title: "Finish the page" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const saved = await createManualEntry(entryInput(site.id, created.todo.id), now, member.id);
    expect(saved.entry.todoId).toBe(created.todo.id);

    const done = await setTodoStatus({ actor: member, id: created.todo.id, status: "done" });
    expect(done.ok).toBe(true);
    expect(await listPickerTodos(member)).toEqual([]);
    expect((await listProjectTodos(member, site.id)).map((todo) => todo.status)).toEqual(["done"]);

    const kept = await updateManualEntry(
      saved.entry.id,
      entryInput(site.id, created.todo.id),
      now,
      member.id,
    );
    expect(kept?.entry.todoId).toBe(created.todo.id);

    await expect(
      createManualEntry(
        {
          ...entryInput(site.id, created.todo.id),
          startedAt: new Date("2026-10-22T11:00:00.000Z"),
          endedAt: new Date("2026-10-22T11:30:00.000Z"),
        },
        now,
        member.id,
      ),
    ).rejects.toBeInstanceOf(TodoUnavailableError);

    const reopened = await setTodoStatus({ actor: member, id: created.todo.id, status: "open" });
    expect(reopened.ok).toBe(true);
    const archived = await setTodoArchived({ actor: member, id: created.todo.id, archived: true });
    expect(archived.ok).toBe(true);
    expect(await listPickerTodos(member)).toEqual([]);
    expect((await listProjectTodos(member, site.id))[0]?.archivedAt).toBeInstanceOf(Date);

    const stillThere = await updateManualEntry(
      saved.entry.id,
      { ...entryInput(site.id, created.todo.id), note: "Kept" },
      now,
      member.id,
    );
    expect(stillThere?.entry.todoId).toBe(created.todo.id);

    const moved = await resolveTodoForEntry({
      actorId: member.id,
      projectId: other.id,
      todoId: created.todo.id,
      currentTodoId: created.todo.id,
    });
    expect(moved.ok).toBe(false);
  });

  it("deletes a to-do with no time and refuses one that already has time", async () => {
    const site = await project();
    const member = await createTestUser("member", "delete-member@ulix.test");
    const empty = await createTodo({ actor: member, projectId: site.id, title: "Scratch note" });
    const tracked = await createTodo({ actor: member, projectId: site.id, title: "Tracked" });
    expect(empty.ok && tracked.ok).toBe(true);
    if (!empty.ok || !tracked.ok) return;

    await createManualEntry(entryInput(site.id, tracked.todo.id), now, member.id);
    const blocked = await deleteTodo(member, tracked.todo.id);
    expect(blocked).toEqual({ ok: false, error: todoCopy.deleteBlocked });
    expect(await prisma.todo.findUnique({ where: { id: tracked.todo.id } })).not.toBeNull();

    const removed = await deleteTodo(member, empty.todo.id);
    expect(removed).toEqual({ ok: true, projectId: site.id });
    expect(await prisma.todo.findUnique({ where: { id: empty.todo.id } })).toBeNull();
  });

  it("treats a user stored as manager like a member", async () => {
    const site = await project();
    const member = await createTestUser("member", "plain-member@ulix.test");
    const manager = await prisma.user.create({
      data: {
        email: "manager-todos@ulix.test",
        name: "Manager",
        role: "manager",
        passwordHash: await hashPassword("test-password-10"),
      },
    });
    const created = await createTodo({ actor: member, projectId: site.id, title: "Private" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await listProjectTodos(manager, site.id)).toEqual([]);
    expect(await listPickerTodos(manager)).toEqual([]);
    const denied = await createTodo({
      actor: manager,
      projectId: site.id,
      title: "Assigned out",
      assigneeIds: [member.id],
    });
    expect(denied).toEqual({ ok: false, error: todoCopy.assignDenied });
    await expect(
      createManualEntry(entryInput(site.id, created.todo.id), now, manager.id),
    ).rejects.toBeInstanceOf(TodoUnavailableError);
  });

  it("saves a typed title for reuse and does not duplicate an exact match", async () => {
    const site = await project();
    const member = await createTestUser("member", "draft-member@ulix.test");
    const first = await todoIdForTime({
      actor: member,
      projectId: site.id,
      todoId: null,
      draftTitle: "Design the header",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const again = await todoIdForTime({
      actor: member,
      projectId: site.id,
      todoId: null,
      draftTitle: " design the header ",
    });
    expect(again).toEqual({ ok: true, todoId: first.todoId });
    expect(await prisma.todo.count()).toBe(1);
    expect((await listPickerTodos(member)).map((todo) => todo.title)).toEqual(["Design the header"]);
  });
});
