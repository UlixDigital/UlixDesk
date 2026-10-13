import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createAccessToken,
  findUsableAccessToken,
  generateAccessToken,
  hashAccessToken,
  listAccessTokens,
  markAccessTokenUsed,
  parseBearerToken,
  parseTokenName,
  revokeAccessToken,
} from "@/lib/access-tokens";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { formatTokenTimestamp, tokenCopy } from "@/lib/token-copy";

beforeEach(resetTestDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("access tokens", () => {
  it("creates a token, stores only its hash, and verifies that hash", async () => {
    const created = await createAccessToken("Work laptop");
    expect(created.token).toMatch(/^ulixdesk_[A-Za-z0-9_-]{43}$/);
    expect(created.record.name).toBe("Work laptop");
    expect(created.record.lastUsedAt).toBeNull();
    expect(created.record.revokedAt).toBeNull();

    const row = await prisma.accessToken.findUniqueOrThrow({ where: { id: created.record.id } });
    expect(row.tokenHash).toBe(hashAccessToken(created.token));
    expect(row.tokenHash).not.toBe(created.token);
    expect(JSON.stringify(row)).not.toContain(created.token);

    const usable = await findUsableAccessToken(created.token);
    expect(usable?.id).toBe(created.record.id);
    expect(await findUsableAccessToken(generateAccessToken())).toBeNull();
    expect(await findUsableAccessToken("not-a-token")).toBeNull();
  });

  it("revokes a token and records last use only for a live one", async () => {
    const created = await createAccessToken("Work laptop");
    const usedAt = new Date("2026-10-10T05:36:00.000Z");
    await markAccessTokenUsed(created.record.id, usedAt);
    const used = await prisma.accessToken.findUniqueOrThrow({ where: { id: created.record.id } });
    expect(used.lastUsedAt?.toISOString()).toBe(usedAt.toISOString());

    const heldAt = new Date(usedAt.getTime() + 59_999);
    await markAccessTokenUsed(created.record.id, heldAt);
    const held = await prisma.accessToken.findUniqueOrThrow({ where: { id: created.record.id } });
    expect(held.lastUsedAt?.toISOString()).toBe(usedAt.toISOString());

    const later = new Date(usedAt.getTime() + 60_000);
    await markAccessTokenUsed(created.record.id, later);
    const refreshed = await prisma.accessToken.findUniqueOrThrow({
      where: { id: created.record.id },
    });
    expect(refreshed.lastUsedAt?.toISOString()).toBe(later.toISOString());

    const revoked = await revokeAccessToken(created.record.id);
    expect(revoked).toEqual({ ok: true, already: false });
    expect(await revokeAccessToken(created.record.id)).toEqual({ ok: true, already: true });
    expect(await findUsableAccessToken(created.token)).toBeNull();
    expect(await revokeAccessToken("missing")).toEqual({ ok: false, reason: "missing" });

    const listed = await listAccessTokens();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.revokedAt).not.toBeNull();
    expect(listed[0]?.name).toBe("Work laptop");
  });

  it("parses bearer headers and token names", () => {
    expect(parseBearerToken("Bearer ulixdesk_abc")).toBe("ulixdesk_abc");
    expect(parseBearerToken("bearer ulixdesk_abc")).toBe("ulixdesk_abc");
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Basic secret")).toBeNull();
    expect(parseBearerToken("Bearer one two")).toBeNull();
    expect(parseTokenName("  Work   laptop  ")).toEqual({ ok: true, name: "Work laptop" });
    expect(parseTokenName("   ")).toEqual({ ok: false, error: tokenCopy.nameRequired });
    expect(parseTokenName("a".repeat(81))).toEqual({ ok: false, error: tokenCopy.nameTooLong });
    expect(formatTokenTimestamp(new Date("2026-10-10T05:36:00.000Z"), "UTC")).toBe(
      "Oct 10, 2026, 5:36 AM",
    );
  });
});
