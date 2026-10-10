import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { TOKEN_NAME_MAX, tokenCopy } from "@/lib/token-copy";

const TOKEN_PREFIX = "ulixdesk_";
/** 32 bytes in base64url, without padding. */
const TOKEN_SECRET_LENGTH = 43;
const TOKEN_PATTERN = new RegExp(`^${TOKEN_PREFIX}[A-Za-z0-9_-]{${TOKEN_SECRET_LENGTH}}$`);

export type AccessTokenRecord = {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export function hashAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateAccessToken() {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function parseBearerToken(header: string) {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  if (!token || token.length > 200) return null;
  return token;
}

export function parseTokenName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: tokenCopy.nameRequired };
  if (name.length > TOKEN_NAME_MAX) return { ok: false, error: tokenCopy.nameTooLong };
  return { ok: true, name };
}

export async function createAccessToken(name: string) {
  const token = generateAccessToken();
  const row = await prisma.accessToken.create({
    data: { name, tokenHash: hashAccessToken(token) },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
  return { token, record: row };
}

export async function listAccessTokens(): Promise<AccessTokenRecord[]> {
  return prisma.accessToken.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
}

export async function revokeAccessToken(id: string) {
  if (!id) return { ok: false as const, reason: "missing" as const };
  const row = await prisma.accessToken.findUnique({
    where: { id },
    select: { id: true, revokedAt: true },
  });
  if (!row) return { ok: false as const, reason: "missing" as const };
  if (row.revokedAt) return { ok: true as const, already: true };
  await prisma.accessToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  return { ok: true as const, already: false };
}

/**
 * Returns the token row when the plaintext matches a hash that has not been revoked.
 * The plaintext is hashed before lookup and is never written to the database.
 */
export async function findUsableAccessToken(token: string) {
  if (!TOKEN_PATTERN.test(token)) return null;
  const tokenHash = hashAccessToken(token);
  const row = await prisma.accessToken.findUnique({ where: { tokenHash } });
  if (!row || row.revokedAt) return null;
  const computed = Buffer.from(tokenHash, "hex");
  const stored = Buffer.from(row.tokenHash, "hex");
  if (computed.length !== stored.length || !timingSafeEqual(computed, stored)) return null;
  return row;
}

const LAST_USED_INTERVAL_MS = 60_000;

/** Writes lastUsedAt at most once a minute. A first use, when it is null, always counts. */
export async function markAccessTokenUsed(id: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - LAST_USED_INTERVAL_MS);
  await prisma.accessToken.updateMany({
    where: {
      id,
      OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: cutoff } }],
    },
    data: { lastUsedAt: now },
  });
}
