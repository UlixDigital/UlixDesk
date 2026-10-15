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
import { setTestSessionToken, testState } from "@/lib/test-hooks";

const ABSOLUTE_MS = 14 * 24 * 60 * 60 * 1000;
const IDLE_MS = 12 * 60 * 60 * 1000;
const ROTATE_MS = 15 * 60 * 1000;
/**
 * After a rotation the previous token still opens the session. Next.js can
 * send the document and a prefetch, or TimezoneSync can call router.refresh,
 * with the same cookie. The request that loses the compare-and-swap must not
 * be treated as signed out, or the refresh route clears the cookie.
 */
const PREVIOUS_TOKEN_MS = 60 * 1000;

const sessionUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  deactivatedAt: true,
} as const;

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
  const hash = sha256(token);
  await prisma.session.deleteMany({
    where: { OR: [{ tokenHash: hash }, { previousTokenHash: hash }] },
  });
}

async function findSessionByPresentedToken(token: string, now: Date) {
  const hash = sha256(token);
  const include = { user: { select: sessionUserSelect } } as const;
  const current = await prisma.session.findUnique({
    where: { tokenHash: hash },
    include,
  });
  if (current) return current;
  return prisma.session.findFirst({
    where: { previousTokenHash: hash, previousTokenExpiresAt: { gt: now } },
    include,
  });
}

export type SessionRead =
  | { status: "anonymous"; hadCookie: boolean }
  | { status: "user"; user: CurrentUser }
  | { status: "rotate"; user: CurrentUser };

/**
 * Reads the session and never writes a cookie. Page renders call this.
 * An invalid, expired, idle, or deactivated session is signed out.
 * A token older than 15 minutes is reported as "rotate" so a route handler
 * can set the new cookie. That write is not allowed during render.
 */
export async function readSession(now = new Date()): Promise<SessionRead> {
  const cookie = await readSessionCookie();
  if (!cookie) return { status: "anonymous", hadCookie: false };
  const secret = process.env.ULIXDESK_SESSION_SECRET ?? "";
  if (sessionSecretProblem(secret, process.env.ULIXDESK_APP_HOSTS ?? "")) {
    return { status: "anonymous", hadCookie: true };
  }
  const token = await verifySessionCookie(cookie, secret);
  if (!token) return { status: "anonymous", hadCookie: true };

  const session = await findSessionByPresentedToken(token, now);
  if (!session || session.expiresAt <= now || session.user.deactivatedAt) {
    if (session) await prisma.session.deleteMany({ where: { id: session.id } });
    return { status: "anonymous", hadCookie: true };
  }
  if (now.getTime() - session.lastSeenAt.getTime() > IDLE_MS) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return { status: "anonymous", hadCookie: true };
  }

  const user = toCurrentUser(session.user);
  if (now.getTime() - session.rotatedAt.getTime() > ROTATE_MS) {
    return { status: "rotate", user };
  }
  if (now.getTime() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
  }
  return { status: "user", user };
}

export async function getCurrentUser(now = new Date()): Promise<CurrentUser | null> {
  const read = await readSession(now);
  if (read.status === "anonymous") return null;
  return read.user;
}

/**
 * Replaces the session token. Call this from a route handler or server action, never from a page.
 * `cookie` is set when a new token was issued, so the caller can put it on its own response.
 */
export async function rotateSessionIfDue(now = new Date()): Promise<
  { ok: false } | { ok: true; cookie: string | null; expiresAt: Date | null }
> {
  const read = await readSession(now);
  if (read.status === "anonymous") return { ok: false };
  if (read.status === "user") return { ok: true, cookie: null, expiresAt: null };

  const cookie = await readSessionCookie();
  const secret = readSessionSecret();
  const token = cookie ? await verifySessionCookie(cookie, secret) : null;
  if (!token) return { ok: false };
  const session = await findSessionByPresentedToken(token, now);
  if (!session) return { ok: false };
  if (now.getTime() - session.rotatedAt.getTime() <= ROTATE_MS) {
    return { ok: true, cookie: null, expiresAt: null };
  }

  const rotatedToken = randomBytes(32).toString("base64url");
  const rotatedCookie = await signSessionCookie(rotatedToken, secret);
  const updated = await prisma.session.updateMany({
    where: { id: session.id, rotatedAt: session.rotatedAt },
    data: {
      tokenHash: sha256(rotatedToken),
      previousTokenHash: sha256(token),
      previousTokenExpiresAt: new Date(now.getTime() + PREVIOUS_TOKEN_MS),
      rotatedAt: now,
      lastSeenAt: now,
    },
  });
  if (updated.count !== 1) {
    const again = await readSession(now);
    if (again.status === "anonymous") return { ok: false };
    return { ok: true, cookie: null, expiresAt: null };
  }
  try {
    await writeSessionCookie(rotatedCookie, session.expiresAt);
  } catch (error) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        tokenHash: session.tokenHash,
        previousTokenHash: session.previousTokenHash,
        previousTokenExpiresAt: session.previousTokenExpiresAt,
        rotatedAt: session.rotatedAt,
        lastSeenAt: session.lastSeenAt,
      },
    });
    throw error;
  }
  return { ok: true, cookie: rotatedCookie, expiresAt: session.expiresAt };
}

/** Hash of the current session token, so a password change can keep this browser signed in. */
export async function currentSessionTokenHash() {
  const cookie = await readSessionCookie();
  if (!cookie) return null;
  const secret = process.env.ULIXDESK_SESSION_SECRET ?? "";
  if (sessionSecretProblem(secret, process.env.ULIXDESK_APP_HOSTS ?? "")) return null;
  const token = await verifySessionCookie(cookie, secret);
  if (!token) return null;
  return sha256(token);
}

export async function userFromCookieHeader(cookieHeader: string | null, now = new Date()) {
  const secret = process.env.ULIXDESK_SESSION_SECRET ?? "";
  if (sessionSecretProblem(secret, process.env.ULIXDESK_APP_HOSTS ?? "")) return null;
  const { readCookieHeader } = await import("@/lib/session-cookie");
  const cookie = readCookieHeader(cookieHeader, SESSION_COOKIE);
  if (!cookie) return null;
  const token = await verifySessionCookie(cookie, secret);
  if (!token) return null;
  const session = await findSessionByPresentedToken(token, now);
  if (!session || session.expiresAt <= now || session.user.deactivatedAt) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > IDLE_MS) return null;
  return toCurrentUser(session.user);
}
