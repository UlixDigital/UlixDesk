import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { archiveClientAction, restoreClientAction, saveClientAction } from "@/app/clients/actions";
import { listClients } from "@/lib/clients";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { emptyClientFormValues, type ClientFormState } from "@/lib/validation";

const initialState: ClientFormState = {
  errors: {},
  values: emptyClientFormValues,
};

function form(entries: Record<string, string | string[]>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      value.forEach((item) => formData.append(key, item));
    } else {
      formData.set(key, value);
    }
  }
  return formData;
}

async function resetDatabase() {
  await resetTestDatabase();
}

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("client actions", () => {
  it("creates a client with only a name", async () => {
    await expect(
      saveClientAction(initialState, form({ name: "Solo Name" })),
    ).rejects.toThrow("REDIRECT:/clients");

    const active = await listClients("active", "");
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      name: "Solo Name",
      address: null,
      phone: null,
      emails: [],
      archivedAt: null,
    });
  });

  it("rejects a missing or blank name", async () => {
    const missing = await saveClientAction(initialState, form({ name: "" }));
    expect(missing.errors.name).toBe("Name is required.");

    const blank = await saveClientAction(
      initialState,
      form({ name: "   " }),
    );
    expect(blank.errors.name).toBe("Name is required.");
    expect(await prisma.client.count()).toBe(0);
  });

  it("edits every slice 1 field", async () => {
    await expect(
      saveClientAction(initialState, form({ name: "Before" })),
    ).rejects.toThrow("REDIRECT:/clients");
    const created = await prisma.client.findFirstOrThrow();

    await expect(
      saveClientAction(
        initialState,
        form({
          id: created.id,
          name: "After",
          address: "9 Oak St",
          phone: "555-0199",
          emails: ["first@after.test"],
          emailDraft: "second@after.test",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/clients");

    const updated = await listClients("active", "");
    expect(updated[0]).toMatchObject({
      id: created.id,
      name: "After",
      address: "9 Oak St",
      phone: "555-0199",
      emails: ["first@after.test", "second@after.test"],
    });
  });

  it("archives and restores through the actions", async () => {
    await expect(
      saveClientAction(initialState, form({ name: "Movable" })),
    ).rejects.toThrow("REDIRECT:/clients");
    const created = await prisma.client.findFirstOrThrow();

    const archiveForm = new FormData();
    archiveForm.set("id", created.id);
    await archiveClientAction(archiveForm);

    expect(await listClients("active", "")).toEqual([]);
    expect((await listClients("archived", "")).map((client) => client.name)).toEqual([
      "Movable",
    ]);

    await restoreClientAction(archiveForm);
    expect((await listClients("active", "")).map((client) => client.name)).toEqual([
      "Movable",
    ]);
    expect(await listClients("archived", "")).toEqual([]);
  });

  it("does not save an invalid email", async () => {
    const result = await saveClientAction(
      initialState,
      form({ name: "Acme", emailDraft: "nope" }),
    );
    expect(result.errors.emails).toBeTruthy();
    expect(await prisma.client.count()).toBe(0);
  });
});
