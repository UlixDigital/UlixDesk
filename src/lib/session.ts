import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  sessionSecretProblem,
  signSessionCookie,
  verifySessionCookie,
} from "@/lib/session-cookie";
import { rememberUser, setTestSessionToken, takeUserMemo, testState } from "@/lib/test-hooks";

const ABSOLUTE_MS = 14 * 24 * 60 * 60 * 1000;
const IDLE_MS = 12 * 60 * 60 * 1000;
const ROTATE_MS = 15 * 60 * 1000;

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  deactivatedAt: Date | null;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function readSessionSecret() {
  const secret = process.env.ULIXDESK_SESSION_SECRET ?? "";
  const problem = sessionSecretProblem(secret, process.env.ULIXDESK_APP_HOSTS ?? "");
  if (problem) throw new Error(problem);
  return secret;
}

function toCurrentUser(user: UserRow): CurrentUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

async function readSessionCookie() {
  if (process.env.VITEST === "true") return testState.sessionToken;
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export async function writeSessionCookie(cookie: string, expiresAt: Date) {
  if (process.env.VITEST === "true") {
    setTestSessionToken(cookie);
    return;
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, cookie, sessionCookieOptions(expiresAt));
}

export async function clearSessionCookie() {
  if (process.env.VITEST === "true") {
    setTestSessionToken(null);
    return;
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function createSession(userId: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + ABSOLUTE_MS);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
      rotatedAt: now,
    },
  });
  const cookie = await signSessionCookie(token, readSessionSecret());
  return { token, cookie, expiresAt };
}

export async function destroySessionCookie(cookie: string | null) {
  if (!cookie) return;
  const secret = process.env.ULIXDESK_SESSION_SECRET ?? "";
  if (sessionSecretProblem(secret, process.env.ULIXDESK_APP_HOSTS ?? "")) return;
  const token = await verifySessionCookie(cookie, secret);
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

/**
 * Loads the user for the current cookie, enforces idle and absolute expiry,
 * and rotates the token after 15 minutes. A second call in the same process
 * with the same cookie reuses the result, including right after rotation.
 */
export async function getCurrentUser(now = new Date()): Promise<CurrentUser | null> {
  const cookie = await readSessionCookie();
  if (!cookie) return null;
  const secret = process.env.ULIXDESK_SESSION_SECRET ?? "";
  if (sessionSecretProblem(secret, process.env.ULIXDESK_APP_HOSTS ?? "")) return null;
  const token = await verifySessionCookie(cookie, secret);
  if (!token) return null;
  const cached = takeUserMemo<CurrentUser>(token);
  if (cached) return cached;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        select: { id: true, email: true, name: true, role: true, deactivatedAt: true },
      },
    },
  });
  if (!session || session.expiresAt <= now || session.user.deactivatedAt) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > IDLE_MS) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  const user = toCurrentUser(session.user);
  let nextToken = token;
  if (now.getTime() - session.rotatedAt.getTime() > ROTATE_MS) {
    const rotatedToken = randomBytes(32).toString("base64url");
    await prisma.session.update({
      where: { id: session.id },
      data: { tokenHash: sha256(rotatedToken), rotatedAt: now, lastSeenAt: now },
    });
    const rotatedCookie = await signSessionCookie(rotatedToken, secret);
    await writeSessionCookie(rotatedCookie, session.expiresAt);
    nextToken = rotatedToken;
  } else if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
  }

  rememberUser(token, user);
  rememberUser(nextToken, user);
  return user;
}

export async function userFromCookieHeader(cookieHeader: string | null, now = new Date()) {
  const secret = process.env.ULIXDESK_SESSION_SECRET ?? "";
  if (sessionSecretProblem(secret, process.env.ULIXDESK_APP_HOSTS ?? "")) return null;
  const { readCookieHeader } = await import("@/lib/session-cookie");
  const cookie = readCookieHeader(cookieHeader, SESSION_COOKIE);
  if (!cookie) return null;
  const token = await verifySessionCookie(cookie, secret);
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        select: { id: true, email: true, name: true, role: true, deactivatedAt: true },
      },
    },
  });
  if (!session || session.expiresAt <= now || session.user.deactivatedAt) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > IDLE_MS) return null;
  return toCurrentUser(session.user);
}
