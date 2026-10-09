import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import {
  archiveProjectAction,
  restoreProjectAction,
  saveProjectAction,
} from "@/app/projects/actions";
import { archiveClient, createClient } from "@/lib/clients";
import { prisma } from "@/lib/db";
import { listProjects } from "@/lib/projects";
import {
  emptyProjectFormValues,
  type ProjectFormState,
} from "@/lib/project-validation";

const initialState: ProjectFormState = {
  errors: {},
  values: emptyProjectFormValues,
};

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

async function resetDatabase() {
  await prisma.project.deleteMany();
  await prisma.clientEmail.deleteMany();
  await prisma.client.deleteMany();
}

async function makeClient(name: string) {
  return createClient({
    name,
    address: null,
    phone: null,
    emails: [],
  });
}

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("project actions", () => {
  it("creates a billable project with only a name", async () => {
    await expect(
      saveProjectAction(
        initialState,
        form({ name: "Solo Name", billable: "on" }),
      ),
    ).rejects.toThrow("REDIRECT:/projects");

    const active = await listProjects("active", "");
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      name: "Solo Name",
      description: null,
      clientId: null,
      billable: true,
      archivedAt: null,
    });
  });

  it("rejects a missing or blank name", async () => {
    const missing = await saveProjectAction(initialState, form({ name: "" }));
    expect(missing.errors.name).toBe("Name is required.");

    const blank = await saveProjectAction(
      initialState,
      form({ name: "   \t  " }),
    );
    expect(blank.errors.name).toBe("Name is required.");
    expect(await prisma.project.count()).toBe(0);
  });

  it("edits description, billable, and client", async () => {
    const client = await makeClient("Acme");
    await expect(
      saveProjectAction(initialState, form({ name: "Before", billable: "on" })),
    ).rejects.toThrow("REDIRECT:/projects");
    const created = await prisma.project.findFirstOrThrow();

    await expect(
      saveProjectAction(
        initialState,
        form({
          id: created.id,
          name: "After",
          description: "Notes",
          clientId: client.id,
        }),
      ),
    ).rejects.toThrow("REDIRECT:/projects");

    const updated = await listProjects("active", "");
    expect(updated[0]).toMatchObject({
      id: created.id,
      name: "After",
      description: "Notes",
      clientId: client.id,
      billable: false,
    });
  });

  it("archives and restores through the actions", async () => {
    await expect(
      saveProjectAction(initialState, form({ name: "Movable", billable: "on" })),
    ).rejects.toThrow("REDIRECT:/projects");
    const created = await prisma.project.findFirstOrThrow();

    const archiveForm = new FormData();
    archiveForm.set("id", created.id);
    await archiveProjectAction(archiveForm);

    expect(await listProjects("active", "")).toEqual([]);
    expect((await listProjects("archived", "")).map((project) => project.name)).toEqual([
      "Movable",
    ]);

    await restoreProjectAction(archiveForm);
    expect((await listProjects("active", "")).map((project) => project.name)).toEqual([
      "Movable",
    ]);
    expect(await listProjects("archived", "")).toEqual([]);
    expect(await prisma.project.count()).toBe(1);
  });

  it("does not let a new project pick an archived client", async () => {
    const client = await makeClient("Old Co");
    await archiveClient(client.id);

    const result = await saveProjectAction(
      initialState,
      form({ name: "Blocked", clientId: client.id, billable: "on" }),
    );

    expect(result.errors.clientId).toBe(
      "Choose an active client, or leave this blank.",
    );
    expect(await prisma.project.count()).toBe(0);
  });

  it("keeps a link when the client is archived later and blocks a different archived client", async () => {
    const current = await makeClient("Old Co");
    const other = await makeClient("Older Co");
    await expect(
      saveProjectAction(
        initialState,
        form({ name: "Legacy", clientId: current.id, billable: "on" }),
      ),
    ).rejects.toThrow("REDIRECT:/projects");
    const created = await prisma.project.findFirstOrThrow();
    await archiveClient(current.id);
    await archiveClient(other.id);

    await expect(
      saveProjectAction(
        initialState,
        form({
          id: created.id,
          name: "Legacy kept",
          clientId: current.id,
          billable: "on",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/projects");

    const kept = await prisma.project.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(kept.name).toBe("Legacy kept");
    expect(kept.clientId).toBe(current.id);

    const blocked = await saveProjectAction(
      initialState,
      form({
        id: created.id,
        name: "Should not save",
        clientId: other.id,
        billable: "on",
      }),
    );
    expect(blocked.errors.clientId).toBe(
      "Choose an active client, or leave this blank.",
    );
    const unchanged = await prisma.project.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(unchanged.name).toBe("Legacy kept");
    expect(unchanged.clientId).toBe(current.id);
  });

  it("returns to the archived tab after editing an archived project", async () => {
    await expect(
      saveProjectAction(initialState, form({ name: "Old", billable: "on" })),
    ).rejects.toThrow("REDIRECT:/projects");
    const created = await prisma.project.findFirstOrThrow();
    const archiveForm = new FormData();
    archiveForm.set("id", created.id);
    await archiveProjectAction(archiveForm);

    await expect(
      saveProjectAction(
        initialState,
        form({ id: created.id, name: "Old renamed", billable: "on" }),
      ),
    ).rejects.toThrow("REDIRECT:/projects?status=archived");
  });
});
