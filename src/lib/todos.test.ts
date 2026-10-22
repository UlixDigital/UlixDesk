import { describe, expect, it } from "vitest";
import { canAssignTodos, canEditTodo, exactTodoMatch, pickerMatches, todoVisibilityWhere } from "@/lib/todos";

describe("to-do visibility", () => {
  it("lets owners and admins see every to-do", () => {
    expect(todoVisibilityWhere({ id: "owner", role: "owner" })).toEqual({});
    expect(todoVisibilityWhere({ id: "admin", role: "admin" })).toEqual({});
    expect(canAssignTodos("owner")).toBe(true);
    expect(canAssignTodos("admin")).toBe(true);
  });

  it("limits a member to to-dos they created or are assigned to", () => {
    expect(todoVisibilityWhere({ id: "sam", role: "member" })).toEqual({
      OR: [{ createdById: "sam" }, { assignees: { some: { userId: "sam" } } }],
    });
    expect(canAssignTodos("member")).toBe(false);
  });

  it("does not elevate a manager, because that role and a project manager do not exist", () => {
    expect(todoVisibilityWhere({ id: "pat", role: "manager" })).toEqual({
      OR: [{ createdById: "pat" }, { assignees: { some: { userId: "pat" } } }],
    });
    expect(canAssignTodos("manager")).toBe(false);
    expect(canEditTodo({ id: "pat", role: "manager" }, "owner")).toBe(false);
  });

  it("lets a member edit only to-dos they created", () => {
    expect(canEditTodo({ id: "sam", role: "member" }, "sam")).toBe(true);
    expect(canEditTodo({ id: "sam", role: "member" }, "admin")).toBe(false);
    expect(canEditTodo({ id: "ada", role: "admin" }, "sam")).toBe(true);
    expect(canEditTodo({ id: "own", role: "owner" }, "sam")).toBe(true);
  });
});

describe("to-do picker matching", () => {
  const todos = [{ title: "Write the brief" }, { title: "Design the header" }];

  it("returns every open to-do for a blank search and filters the rest", () => {
    expect(pickerMatches(todos, "  ")).toEqual(todos);
    expect(pickerMatches(todos, "HEAD")).toEqual([{ title: "Design the header" }]);
  });

  it("reuses an exact title ignoring case", () => {
    expect(exactTodoMatch(todos, " write the brief ")?.title).toBe("Write the brief");
    expect(exactTodoMatch(todos, "brief")).toBeNull();
    expect(exactTodoMatch(todos, "   ")).toBeNull();
  });
});
