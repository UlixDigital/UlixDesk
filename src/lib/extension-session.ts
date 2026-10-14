import { randomBytes, timingSafeEqual } from "node:crypto";
import { hashAccessToken } from "@/lib/access-tokens";
import { prisma } from "@/lib/db";

const ACCESS_PREFIX = "ulixdesk_a_";
const REFRESH_PREFIX = "ulixdesk_r_";
const SECRET_LENGTH = 43;

/**
 * Access tokens last 15 minutes, the same cadence as a web session rotation.
 * Refresh tokens last 30 days from sign-in and are rotated on each refresh.
 * The 30-day deadline does not move, so using the extension does not extend it.
 * Presenting the previous refresh token after a short grace period revokes the
 * sign-in. The grace covers the popup and the badge worker refreshing together.
 */
export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_REUSE_GRACE_MS = 60_000;

const ACCESS_PATTERN = new RegExp(`^${ACCESS_PREFIX}[A-Za-z0-9_-]{${SECRET_LENGTH}}$`);
const REFRESH_PATTERN = new RegExp(`^${REFRESH_PREFIX}[A-Za-z0-9_-]{${SECRET_LENGTH}}$`);

export type ExtensionSessionRecord = {
  id: string;
  label: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

export type ExtensionSessionUser = {
  name: string;
  email: string;
};

function generateSecret(prefix: string) {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

function hashesMatch(computedHex: string, storedHex: string) {
  const computed = Buffer.from(computedHex, "hex");
  const stored = Buffer.from(storedHex, "hex");
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}

export function isExtensionAccessToken(token: string) {
  return ACCESS_PATTERN.test(token);
}

export function isExtensionRefreshToken(token: string) {
  return REFRESH_PATTERN.test(token);
}

export async function createExtensionSession(input: {
  userId: string;
  label: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const accessToken = generateSecret(ACCESS_PREFIX);
  const refreshToken = generateSecret(REFRESH_PREFIX);
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TTL_MS);
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TTL_MS);
  const row = await prisma.extensionSession.create({
    data: {
      userId: input.userId,
      label: input.label,
      accessTokenHash: hashAccessToken(accessToken),
      refreshTokenHash: hashAccessToken(refreshToken),
      accessExpiresAt,
      refreshExpiresAt,
      createdAt: now,
      rotatedAt: now,
    },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
  return { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, record: row };
}

export async function listExtensionSessions(userId: string): Promise<ExtensionSessionRecord[]> {
  return prisma.extensionSession.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
}

export async function revokeExtensionSession(id: string, userId: string, now = new Date()) {
  if (!id) return { ok: false as const, reason: "missing" as const };
  const row = await prisma.extensionSession.findFirst({
    where: { id, userId },
    select: { id: true, revokedAt: true },
  });
  if (!row) return { ok: false as const, reason: "missing" as const };
  if (row.revokedAt) return { ok: true as const, already: true };
  await prisma.extensionSession.update({
    where: { id },
    data: { revokedAt: now },
  });
  return { ok: true as const, already: false };
}

export async function revokeExtensionSessionsForUser(userId: string, now = new Date()) {
  await prisma.extensionSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
}

/**
 * Returns the session when the access token matches a hash that is still live.
 * An expired, revoked, or deactivated credential is rejected.
 */
export async function findUsableExtensionAccess(token: string, now = new Date()) {
  if (!isExtensionAccessToken(token)) return null;
  const tokenHash = hashAccessToken(token);
  const row = await prisma.extensionSession.findUnique({
    where: { accessTokenHash: tokenHash },
    include: { user: { select: { id: true, name: true, email: true, deactivatedAt: true } } },
  });
  if (!row || row.revokedAt || row.accessExpiresAt <= now || row.user.deactivatedAt) return null;
  if (!hashesMatch(tokenHash, row.accessTokenHash)) return null;
  return row;
}

const LAST_USED_INTERVAL_MS = 60_000;

export async function markExtensionSessionUsed(id: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - LAST_USED_INTERVAL_MS);
  await prisma.extensionSession.updateMany({
    where: {
      id,
      OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: cutoff } }],
    },
    data: { lastUsedAt: now },
  });
}

export type RefreshResult =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      accessExpiresAt: Date;
      refreshExpiresAt: Date;
      user: ExtensionSessionUser;
    }
  | { ok: false; code: "invalid" | "reused" | "deactivated" };

/**
 * Rotates the refresh token. A second use of the previous refresh token, after
 * the grace period, revokes the sign-in. Within the grace period it is refused
 * without revoking, so two parts of the extension can refresh at once.
 */
export async function rotateExtensionSession(refreshToken: string, now = new Date()): Promise<RefreshResult> {
  if (!isExtensionRefreshToken(refreshToken)) return { ok: false, code: "invalid" };
  const presentedHash = hashAccessToken(refreshToken);
  const accessToken = generateSecret(ACCESS_PREFIX);
  const nextRefresh = generateSecret(REFRESH_PREFIX);
  const accessExpiresAt = new Date(now.getTime() + ACCESS_TTL_MS);
  const updated = await prisma.extensionSession.updateMany({
    where: {
      refreshTokenHash: presentedHash,
      revokedAt: null,
      refreshExpiresAt: { gt: now },
    },
    data: {
      accessTokenHash: hashAccessToken(accessToken),
      refreshTokenHash: hashAccessToken(nextRefresh),
      previousRefreshHash: presentedHash,
      accessExpiresAt,
      rotatedAt: now,
      lastUsedAt: now,
    },
  });

  if (updated.count === 1) {
    const row = await prisma.extensionSession.findUnique({
      where: { refreshTokenHash: hashAccessToken(nextRefresh) },
      include: { user: { select: { name: true, email: true, deactivatedAt: true } } },
    });
    if (!row) return { ok: false, code: "invalid" };
    if (row.user.deactivatedAt) {
      await prisma.extensionSession.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: now },
      });
      return { ok: false, code: "deactivated" };
    }
    return {
      ok: true,
      accessToken,
      refreshToken: nextRefresh,
      accessExpiresAt,
      refreshExpiresAt: row.refreshExpiresAt,
      user: { name: row.user.name, email: row.user.email },
    };
  }

  const previous = await prisma.extensionSession.findUnique({
    where: { previousRefreshHash: presentedHash },
    include: { user: { select: { deactivatedAt: true } } },
  });
  if (!previous || previous.revokedAt || previous.refreshExpiresAt <= now) {
    return { ok: false, code: "invalid" };
  }
  if (previous.user.deactivatedAt) {
    await prisma.extensionSession.updateMany({
      where: { id: previous.id, revokedAt: null },
      data: { revokedAt: now },
    });
    return { ok: false, code: "deactivated" };
  }
  if (now.getTime() - previous.rotatedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
    await prisma.extensionSession.updateMany({
      where: { id: previous.id, revokedAt: null },
      data: { revokedAt: now },
    });
    return { ok: false, code: "reused" };
  }
  return { ok: false, code: "invalid" };
}

/** Revokes the sign-in that matches a refresh token or an access token. */
export async function revokePresentedExtensionSession(
  input: { refreshToken?: string; accessToken?: string },
  now = new Date(),
) {
  const refreshToken = input.refreshToken ?? "";
  const accessToken = input.accessToken ?? "";
  const refreshHash = isExtensionRefreshToken(refreshToken) ? hashAccessToken(refreshToken) : null;
  const accessHash = isExtensionAccessToken(accessToken) ? hashAccessToken(accessToken) : null;
  if (!refreshHash && !accessHash) return { ok: false as const, reason: "invalid" as const };

  const row = await prisma.extensionSession.findFirst({
    where: {
      OR: [
        ...(refreshHash
          ? [{ refreshTokenHash: refreshHash }, { previousRefreshHash: refreshHash }]
          : []),
        ...(accessHash ? [{ accessTokenHash: accessHash }] : []),
      ],
    },
    select: { id: true, revokedAt: true },
  });
  if (!row) return { ok: false as const, reason: "invalid" as const };
  if (!row.revokedAt) {
    await prisma.extensionSession.update({
      where: { id: row.id },
      data: { revokedAt: now },
    });
  }
  return { ok: true as const };
}
