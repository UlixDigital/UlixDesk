import { describe, expect, it } from "vitest";
import {
  emptyProjectFormValues,
  parseProjectFormData,
  validateProjectInput,
} from "@/lib/project-validation";

describe("validateProjectInput", () => {
  it("accepts a name and leaves the other fields empty", () => {
    const result = validateProjectInput({
      ...emptyProjectFormValues,
      name: "  Website   Redesign ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      name: "Website Redesign",
      description: null,
      clientId: null,
      billable: true,
    });
  });

  it("requires a name", () => {
    const result = validateProjectInput(emptyProjectFormValues);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.name).toBe("Name is required.");
  });

  it("rejects a whitespace-only name", () => {
    const result = validateProjectInput({
      ...emptyProjectFormValues,
      name: "   \n  ",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.name).toBe("Name is required.");
  });

  it("trims the description and keeps an explicit non-billable value", () => {
    const result = validateProjectInput({
      name: "Support",
      description: "  Weekday coverage \n only  ",
      clientId: "  client-1  ",
      billable: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      name: "Support",
      description: "Weekday coverage \n only",
      clientId: "client-1",
      billable: false,
    });
  });

  it("rejects a description that is too long", () => {
    const result = validateProjectInput({
      ...emptyProjectFormValues,
      name: "Support",
      description: "a".repeat(2001),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.description).toBe(
      "Description must be 2000 characters or fewer.",
    );
  });
});

describe("parseProjectFormData", () => {
  it("treats a checked billable box as on and a missing box as off", () => {
    const checked = new FormData();
    checked.set("name", "Support");
    checked.set("description", "Notes");
    checked.set("clientId", "client-1");
    checked.set("billable", "on");

    expect(parseProjectFormData(checked)).toEqual({
      name: "Support",
      description: "Notes",
      clientId: "client-1",
      billable: true,
    });

    const unchecked = new FormData();
    unchecked.set("name", "Support");
    expect(parseProjectFormData(unchecked).billable).toBe(false);
  });
});

describe("emptyProjectFormValues", () => {
  it("starts billable", () => {
    expect(emptyProjectFormValues.billable).toBe(true);
  });
});
