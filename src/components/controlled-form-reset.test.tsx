/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// React only flushes updates inside act() when this flag is set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { TimerControls } from "@/components/timer-controls";
import { TimeEntryForm } from "@/components/time-entry-form";
import { ProjectForm } from "@/components/project-form";
import { timeCopy } from "@/lib/time-copy";
import { emptyProjectFormValues, type ProjectFormState } from "@/lib/project-validation";
import { emptyTimeEntryFormValues } from "@/lib/time-validation";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement("a", { href }, children),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
}));

vi.mock("@/app/timesheets/actions", async () => {
  const actual = await vi.importActual<typeof import("@/app/timesheets/actions")>(
    "@/app/timesheets/actions",
  );
  return {
    ...actual,
    startTimerAction: async () => ({
      error: "That project no longer exists.",
      warnings: [],
    }),
  };
});

let root: Root | null = null;

afterEach(() => {
  window.sessionStorage.clear();
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
});

async function render(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
}

async function setControl(id: string, value: string) {
  const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  await act(async () => {
    const prototype = Object.getPrototypeOf(element) as object;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.requestSubmit();
  });
}

describe("controlled selects after a failed save", () => {
  it("keeps the time entry project when the save is rejected", async () => {
    await render(
      createElement(TimeEntryForm, {
        mode: "create",
        timeZone: "UTC",
        title: "Add time",
        description: "Track time",
        submitLabel: "Save time",
        cancelHref: "/timesheets",
        projects: [
          {
            id: "website",
            name: "Website",
            billable: true,
            archived: false,
            clientName: "Acme",
          },
        ],
        overlaps: [],
        initialState: {
          errors: {},
          values: emptyTimeEntryFormValues("UTC", "2026-10-08"),
        },
      }),
    );

    const project = document.getElementById("entry-project") as HTMLSelectElement;
    await setControl("entry-project", "website");
    await setControl("entry-date", "2026-10-08");
    await setControl("entry-start", "09:00");
    await setControl("entry-end", "09:00");
    expect(project.value).toBe("website");

    await submit(project.form!);
    expect(document.body.textContent).toContain(timeCopy.endAfterStart);
    expect(project.value).toBe("website");
    expect(document.body.textContent).not.toContain(timeCopy.projectRequired);

    await submit(project.form!);
    expect(project.value).toBe("website");
    expect(document.body.textContent).not.toContain(timeCopy.projectRequired);
    expect((project.selectedOptions[0]?.textContent ?? "").trim()).toBe("Website · Acme");
  });

  it("keeps the project form's client when the name is blank", async () => {
    const initial: ProjectFormState = { errors: {}, values: emptyProjectFormValues };
    await render(
      createElement(ProjectForm, {
        action: async (_state, formData) => ({
          errors: { name: "Name is required." },
          values: {
            name: String(formData.get("name") ?? ""),
            description: String(formData.get("description") ?? ""),
            clientId: String(formData.get("clientId") ?? ""),
            billable: formData.get("billable") === "on",
          },
        }),
        initialState: initial,
        title: "Add project",
        description: "Create a project",
        submitLabel: "Create project",
        cancelHref: "/projects",
        clients: [
          { id: "acme", name: "Acme", archived: false },
          { id: "globex", name: "Globex", archived: false },
        ],
      }),
    );

    const client = document.getElementById("project-client") as HTMLSelectElement;
    await setControl("project-client", "acme");
    expect(client.value).toBe("acme");

    await submit(client.form!);
    expect(document.body.textContent).toContain("Name is required.");
    expect(client.value).toBe("acme");
    expect(client.selectedOptions[0]?.textContent).toBe("Acme");
  });

  it("keeps the header timer project when start is rejected", async () => {
    await render(
      createElement(TimerControls, {
        projects: [{ id: "missing-project", name: "Website", clientName: null }],
        timer: null,
        serverNow: Date.parse("2026-10-09T15:00:00.000Z"),
      }),
    );

    const project = document.getElementById("timer-project") as HTMLSelectElement;
    await setControl("timer-project", "missing-project");
    expect(project.value).toBe("missing-project");

    await submit(project.form!);
    expect(document.body.textContent).toContain(timeCopy.projectMissing);
    expect(project.value).toBe("missing-project");
  });

  it("clears an archived timer project and says it is no longer active", async () => {
    const serverNow = Date.parse("2026-10-09T15:00:00.000Z");
    await render(
      createElement(TimerControls, {
        projects: [
          { id: "website", name: "Website", clientName: null },
          { id: "other", name: "Other", clientName: null },
        ],
        timer: null,
        serverNow,
      }),
    );

    await setControl("timer-project", "website");
    expect(window.sessionStorage.getItem("ulixdesk-timer-project")).toBe("website");

    await act(async () => {
      root?.render(
        createElement(TimerControls, {
          projects: [{ id: "other", name: "Other", clientName: null }],
          timer: null,
          serverNow,
        }),
      );
    });

    const project = document.getElementById("timer-project") as HTMLSelectElement;
    expect(project.value).toBe("");
    expect(document.body.textContent).toContain(timeCopy.timerProjectGone);
    expect(window.sessionStorage.getItem("ulixdesk-timer-project")).toBeNull();

    await act(async () => {
      root?.unmount();
    });
    root = null;
    await render(
      createElement(TimerControls, {
        projects: [{ id: "other", name: "Other", clientName: null }],
        timer: null,
        serverNow,
      }),
    );
    expect(document.body.textContent).not.toContain(timeCopy.timerProjectGone);
    expect(document.body.textContent).toContain(timeCopy.chooseProject);
  });

  it("posts the project form so a click before hydration is not a GET", async () => {
    let calls = 0;
    const initial: ProjectFormState = { errors: {}, values: emptyProjectFormValues };
    await render(
      createElement(ProjectForm, {
        action: async () => {
          calls += 1;
          return {
            errors: { name: "Name is required." },
            values: emptyProjectFormValues,
          };
        },
        initialState: initial,
        title: "Add project",
        description: "Create a project",
        submitLabel: "Create project",
        cancelHref: "/projects",
        clients: [],
      }),
    );
    const form = document.querySelector("form");
    expect(form?.getAttribute("action")).not.toBeNull();
    await submit(form!);
    expect(calls).toBe(1);
    expect(document.body.textContent).toContain("Name is required.");
  });
});
