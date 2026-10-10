import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createAccessTokenAction, revokeAccessTokenAction } from "@/app/settings/actions";
import { findUsableAccessToken, hashAccessToken } from "@/lib/access-tokens";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { tokenCopy } from "@/lib/token-copy";

beforeEach(resetTestDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

const initial = { errors: {}, values: { name: "" }, token: null, tokenName: null };

describe("access token actions", () => {
  it("creates a named token once and revokes it", async () => {
    const created = await createAccessTokenAction(initial, form({ name: "  Work laptop  " }));
    expect(created.errors).toEqual({});
    expect(created.tokenName).toBe("Work laptop");
    expect(created.token).toMatch(/^ulixdesk_[A-Za-z0-9_-]{43}$/);
    expect(created.values.name).toBe("");

    const row = await prisma.accessToken.findFirstOrThrow();
    expect(row.name).toBe("Work laptop");
    expect(row.tokenHash).toBe(hashAccessToken(created.token!));
    expect(JSON.stringify(row)).not.toContain(created.token);
    expect(await findUsableAccessToken(created.token!)).not.toBeNull();

    await revokeAccessTokenAction(form({ id: row.id }));
    expect(await findUsableAccessToken(created.token!)).toBeNull();
    expect((await prisma.accessToken.findUniqueOrThrow({ where: { id: row.id } })).revokedAt).not.toBeNull();
  });

  it("rejects a blank or oversized name without storing a token", async () => {
    const blank = await createAccessTokenAction(initial, form({ name: "   " }));
    expect(blank.errors.name).toBe(tokenCopy.nameRequired);
    expect(blank.token).toBeNull();

    const long = await createAccessTokenAction(initial, form({ name: "a".repeat(81) }));
    expect(long.errors.name).toBe(tokenCopy.nameTooLong);
    expect(await prisma.accessToken.count()).toBe(0);
  });
});

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}
