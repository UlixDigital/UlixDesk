/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// React only flushes updates inside act() when this flag is set.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { TimerControls } from "@/components/timer-controls";
import { TimeEntryForm } from "@/components/time-entry-form";
import { ProjectForm } from "@/components/project-form";
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

let root: Root | null = null;

afterEach(() => {
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

async function choose(id: string, value: string) {
  const select = document.getElementById(id) as HTMLSelectElement;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return select;
}

/**
 * Browsers fire a cancelable reset event and skip the control reset when it
 * is cancelled. happy-dom resets first and ignores preventDefault, so this
 * follows the HTML spec. React 19 calls form.reset() after a server action.
 */
function resetLikeBrowser(form: HTMLFormElement) {
  const event = new Event("reset", { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  if (event.defaultPrevented) return;
  for (const element of form.elements) {
    if (element instanceof HTMLSelectElement) {
      element.value = element.options[0]?.value ?? "";
    }
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      element.checked = element.defaultChecked;
    }
  }
}

describe("controlled selects after a form reset", () => {
  it("keeps the time entry project and billable flag when React resets the form", async () => {
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
          values: emptyTimeEntryFormValues("UTC", "2026-10-09"),
        },
      }),
    );

    const project = await choose("entry-project", "website");
    const billable = document.getElementById("entry-billable") as HTMLInputElement;
    await act(async () => {
      billable.click();
    });
    expect(project.value).toBe("website");
    expect(billable.checked).toBe(false);

    await act(async () => {
      if (project.form) resetLikeBrowser(project.form);
    });

    expect(project.value).toBe("website");
    expect(billable.checked).toBe(false);
    expect((project.selectedOptions[0]?.textContent ?? "").trim()).toBe("Website · Acme");
  });

  it("keeps the project form's client when React resets the form", async () => {
    const initial: ProjectFormState = { errors: {}, values: emptyProjectFormValues };
    await render(
      createElement(ProjectForm, {
        action: async (state) => state,
        initialState: initial,
        title: "Add project",
        description: "Create a project",
        submitLabel: "Save project",
        cancelHref: "/projects",
        clients: [
          { id: "acme", name: "Acme", archived: false },
          { id: "globex", name: "Globex", archived: false },
        ],
      }),
    );

    const client = await choose("project-client", "globex");
    expect(client.value).toBe("globex");

    await act(async () => {
      if (client.form) resetLikeBrowser(client.form);
    });

    expect(client.value).toBe("globex");
    expect(client.selectedOptions[0]?.textContent).toBe("Globex");
  });

  it("keeps the header timer project when React resets the form", async () => {
    await render(
      createElement(TimerControls, {
        projects: [{ id: "website", name: "Website", clientName: null }],
        timer: null,
        serverNow: Date.parse("2026-10-09T15:00:00.000Z"),
      }),
    );

    const project = await choose("timer-project", "website");
    expect(project.value).toBe("website");

    await act(async () => {
      if (project.form) resetLikeBrowser(project.form);
    });

    expect(project.value).toBe("website");
  });
});
