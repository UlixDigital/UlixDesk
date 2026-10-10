import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { archiveClient, createClient } from "@/lib/clients";
import {
  archiveProject,
  clientAssignmentError,
  countProjectsByStatus,
  createProject,
  getProject,
  listClientChoices,
  listProjects,
  listProjectsForClient,
  restoreProject,
  updateProject,
} from "@/lib/projects";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";

async function resetDatabase() {
  await resetTestDatabase();
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

describe("project records", () => {
  it("creates a project with only a name and defaults billable on", async () => {
    const created = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: true,
    });

    expect(created.archivedAt).toBeNull();
    expect(created.description).toBeNull();
    expect(created.clientId).toBeNull();
    expect(created.client).toBeNull();
    expect(created.billable).toBe(true);

    const bare = await prisma.project.create({ data: { name: "Bare" } });
    expect(bare.billable).toBe(true);

    expect((await listProjects("active", "")).map((project) => project.name)).toEqual([
      "Bare",
      "Website",
    ]);
  });

  it("updates description, billable, and the client in place", async () => {
    const client = await makeClient("Acme");
    const created = await createProject({
      name: "Website",
      description: null,
      clientId: null,
      billable: true,
    });

    const updated = await updateProject(created.id, {
      name: "Website Redesign",
      description: "Marketing site",
      clientId: client.id,
      billable: false,
    });

    expect(updated?.id).toBe(created.id);
    expect(updated).toMatchObject({
      name: "Website Redesign",
      description: "Marketing site",
      clientId: client.id,
      billable: false,
      archivedAt: null,
    });
    expect(updated?.client?.name).toBe("Acme");
    expect(await prisma.project.count()).toBe(1);
  });

  it("archives and restores without deleting the row", async () => {
    const created = await createProject({
      name: "Archive Me",
      description: "Keep this",
      clientId: null,
      billable: true,
    });

    const archived = await archiveProject(created.id);
    expect(archived?.archivedAt).toBeInstanceOf(Date);
    expect(await listProjects("active", "")).toEqual([]);
    expect((await listProjects("archived", "")).map((project) => project.id)).toEqual([
      created.id,
    ]);

    const archivedAgain = await archiveProject(created.id);
    expect(archivedAgain?.archivedAt?.toISOString()).toBe(
      archived?.archivedAt?.toISOString(),
    );

    const restored = await restoreProject(created.id);
    expect(restored?.archivedAt).toBeNull();
    expect(restored?.description).toBe("Keep this");
    expect((await listProjects("active", "")).map((project) => project.id)).toEqual([
      created.id,
    ]);
    expect(await listProjects("archived", "")).toEqual([]);
    expect(await prisma.project.count()).toBe(1);
  });

  it("filters the current tab by project name and ignores description and client name", async () => {
    const client = await makeClient("Acme");
    await createProject({
      name: "Site Active",
      description: "Mentions portal",
      clientId: client.id,
      billable: true,
    });
    const archived = await createProject({
      name: "Site Archived",
      description: null,
      clientId: null,
      billable: true,
    });
    await archiveProject(archived.id);
    await createProject({
      name: "Portal",
      description: "site notes",
      clientId: null,
      billable: false,
    });

    expect(
      (await listProjects("active", "SITE")).map((project) => project.name),
    ).toEqual(["Site Active"]);
    expect(
      (await listProjects("archived", "site")).map((project) => project.name),
    ).toEqual(["Site Archived"]);
    expect(
      (await listProjects("active", "portal")).map((project) => project.name),
    ).toEqual(["Portal"]);
    expect(await listProjects("active", "mentions")).toEqual([]);
    expect(await listProjects("active", "acme")).toEqual([]);
  });

  it("keeps active and archived totals stable while search and client filter change the list", async () => {
    const acme = await makeClient("Acme");
    const other = await makeClient("Other Co");
    await createProject({
      name: "Acme Site",
      description: null,
      clientId: acme.id,
      billable: true,
    });
    await createProject({
      name: "Other Site",
      description: null,
      clientId: other.id,
      billable: true,
    });
    const archived = await createProject({
      name: "Acme Old",
      description: null,
      clientId: acme.id,
      billable: true,
    });
    await archiveProject(archived.id);

    expect(await countProjectsByStatus()).toEqual({ active: 2, archived: 1 });
    expect(
      (await listProjects("active", "acme")).map((project) => project.name),
    ).toEqual(["Acme Site"]);
    expect(await listProjects("active", "", acme.id)).toHaveLength(1);
    expect(await listProjects("archived", "", acme.id)).toHaveLength(1);
    expect(await listProjects("active", "missing", acme.id)).toEqual([]);
    expect(await countProjectsByStatus()).toEqual({ active: 2, archived: 1 });
  });

  it("excludes archived clients from the picker and keeps an existing link", async () => {
    const active = await makeClient("Active Co");
    const archived = await makeClient("Old Co");
    const otherArchived = await makeClient("Older Co");
    await archiveClient(otherArchived.id);

    const project = await createProject({
      name: "Legacy",
      description: null,
      clientId: archived.id,
      billable: true,
    });
    await archiveClient(archived.id);

    const loaded = await getProject(project.id);
    expect(loaded?.clientId).toBe(archived.id);
    expect(loaded?.client?.name).toBe("Old Co");
    expect(loaded?.client?.archivedAt).toBeInstanceOf(Date);
    expect(await prisma.project.count()).toBe(1);

    const createChoices = await listClientChoices(null);
    expect(createChoices.map((client) => client.id)).toEqual([active.id]);

    const editChoices = await listClientChoices(archived.id);
    expect(editChoices.map((client) => client.id).sort()).toEqual(
      [active.id, archived.id].sort(),
    );
    expect(editChoices.find((client) => client.id === otherArchived.id)).toBeUndefined();

    expect(await clientAssignmentError(archived.id, null)).toBe(
      "Choose an active client, or leave this blank.",
    );
    expect(await clientAssignmentError(archived.id, archived.id)).toBeNull();
    expect(await clientAssignmentError(otherArchived.id, archived.id)).toBe(
      "Choose an active client, or leave this blank.",
    );
    expect(await clientAssignmentError("missing", null)).toBe(
      "That client no longer exists.",
    );
    expect(await clientAssignmentError(null, archived.id)).toBeNull();
  });

  it("lists a client's projects with active ones first and none when there are no links", async () => {
    const client = await makeClient("Acme");
    const other = await makeClient("Other");
    const archived = await createProject({
      name: "Zeta",
      description: null,
      clientId: client.id,
      billable: true,
    });
    await archiveProject(archived.id);
    await createProject({
      name: "Alpha",
      description: null,
      clientId: client.id,
      billable: true,
    });
    await createProject({
      name: "Elsewhere",
      description: null,
      clientId: other.id,
      billable: true,
    });

    const listed = await listProjectsForClient(client.id);
    expect(listed.map((project) => project.name)).toEqual(["Alpha", "Zeta"]);
    expect(listed[0]?.archivedAt).toBeNull();
    expect(listed[1]?.archivedAt).toBeInstanceOf(Date);
    expect(await listProjectsForClient(other.id)).toHaveLength(1);
    expect(await listProjectsForClient("missing")).toEqual([]);
  });

  it("returns null when the project id does not exist", async () => {
    expect(await getProject("missing")).toBeNull();
    expect(
      await updateProject("missing", {
        name: "Nope",
        description: null,
        clientId: null,
        billable: true,
      }),
    ).toBeNull();
    expect(await archiveProject("missing")).toBeNull();
    expect(await restoreProject("missing")).toBeNull();
  });
});
