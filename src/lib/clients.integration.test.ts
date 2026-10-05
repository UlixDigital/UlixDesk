import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  archiveClient,
  createClient,
  getClient,
  listClients,
  restoreClient,
  updateClient,
} from "@/lib/clients";
import { prisma } from "@/lib/db";

async function resetDatabase() {
  await prisma.project.deleteMany();
  await prisma.clientEmail.deleteMany();
  await prisma.client.deleteMany();
}

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("client records", () => {
  it("creates a client with only a name", async () => {
    const created = await createClient({
      name: "Acme",
      address: null,
      phone: null,
      emails: [],
    });

    expect(created.archivedAt).toBeNull();
    expect(created.address).toBeNull();
    expect(created.phone).toBeNull();
    expect(created.emails).toEqual([]);

    const active = await listClients("active", "");
    expect(active.map((client) => client.name)).toEqual(["Acme"]);
  });

  it("updates address, phone, and emails in place", async () => {
    const created = await createClient({
      name: "Acme",
      address: null,
      phone: null,
      emails: ["old@acme.test", "keep@acme.test"],
    });

    const updated = await updateClient(created.id, {
      name: "Acme North",
      address: "100 Market St\nAustin",
      phone: "+1 555 010 1234",
      emails: ["new@acme.test"],
    });

    expect(updated?.id).toBe(created.id);
    expect(updated).toMatchObject({
      name: "Acme North",
      address: "100 Market St\nAustin",
      phone: "+1 555 010 1234",
      emails: ["new@acme.test"],
      archivedAt: null,
    });
    expect(await prisma.client.count()).toBe(1);
  });

  it("archives and restores without deleting the row", async () => {
    const created = await createClient({
      name: "Archive Me",
      address: "1 Main",
      phone: "5550100",
      emails: ["keep@archive.test"],
    });

    const archived = await archiveClient(created.id);
    expect(archived?.archivedAt).toBeInstanceOf(Date);
    expect(await listClients("active", "")).toEqual([]);
    expect((await listClients("archived", "")).map((client) => client.id)).toEqual([
      created.id,
    ]);

    const archivedAgain = await archiveClient(created.id);
    expect(archivedAgain?.archivedAt?.toISOString()).toBe(
      archived?.archivedAt?.toISOString(),
    );

    const restored = await restoreClient(created.id);
    expect(restored?.archivedAt).toBeNull();
    expect(restored?.emails).toEqual(["keep@archive.test"]);
    expect((await listClients("active", "")).map((client) => client.id)).toEqual([
      created.id,
    ]);
    expect(await listClients("archived", "")).toEqual([]);
    expect(await prisma.client.count()).toBe(1);
  });

  it("filters the current tab by name and ignores other fields", async () => {
    await createClient({
      name: "Acme Active",
      address: "Northwind Street",
      phone: "5550199",
      emails: ["billing@hidden.test"],
    });
    const archived = await createClient({
      name: "Acme Archived",
      address: null,
      phone: null,
      emails: [],
    });
    await archiveClient(archived.id);
    await createClient({
      name: "Other Co",
      address: null,
      phone: null,
      emails: ["acme@other.test"],
    });

    expect(
      (await listClients("active", "ACME")).map((client) => client.name),
    ).toEqual(["Acme Active"]);
    expect(
      (await listClients("archived", "acme")).map((client) => client.name),
    ).toEqual(["Acme Archived"]);
    expect(await listClients("active", "billing")).toEqual([]);
    expect(await listClients("active", "5550199")).toEqual([]);
    expect(await listClients("active", "northwind")).toEqual([]);
    expect(
      (await listClients("active", "other")).map((client) => client.name),
    ).toEqual(["Other Co"]);
  });

  it("returns null when the client id does not exist", async () => {
    expect(await getClient("missing")).toBeNull();
    expect(await updateClient("missing", {
      name: "Nope",
      address: null,
      phone: null,
      emails: [],
    })).toBeNull();
    expect(await archiveClient("missing")).toBeNull();
    expect(await restoreClient("missing")).toBeNull();
  });
});
