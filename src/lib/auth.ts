import { redirect } from "next/navigation";
import { authCopy } from "@/lib/auth-copy";
import { originAllowed } from "@/lib/csrf";
import {
  clearLoginFailures,
  loginLimited,
  recordLoginFailure,
} from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-headers";
import {
  clearSessionCookie,
  createSession,
  destroySessionCookie,
  getCurrentUser,
  readSessionSecret,
  writeSessionCookie,
  type CurrentUser,
} from "@/lib/session";
import { testState } from "@/lib/test-hooks";
import { canManageWorkspace, validateEmail } from "@/lib/users-validation";
import { dummyPasswordHash, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/db";

export type LoginResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; error: string; code: "invalid" | "deactivated" | "rate-limited" };

export async function authenticateLogin(
  emailRaw: string,
  password: string,
  ip: string,
  now = Date.now(),
): Promise<LoginResult> {
  const parsed = validateEmail(emailRaw);
  const email = parsed.ok ? parsed.email : emailRaw.trim().toLowerCase();
  const limit = loginLimited(ip, email, now);
  if (limit.limited) return { ok: false, error: authCopy.rateLimited, code: "rate-limited" };

  const user = parsed.ok
    ? await prisma.user.findUnique({ where: { email: parsed.email } })
    : null;
  const passwordHash = user?.passwordHash ?? (await dummyPasswordHash());
  const matches = await verifyPassword(password, passwordHash);
  if (!user || !user.passwordHash || !matches) {
    recordLoginFailure(ip, email, now);
    return { ok: false, error: authCopy.invalidLogin, code: "invalid" };
  }
  if (user.deactivatedAt) {
    return { ok: false, error: authCopy.deactivated, code: "deactivated" };
  }
  clearLoginFailures(ip, email);
  return {
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

export async function loginUser(email: string, password: string) {
  readSessionSecret();
  const result = await authenticateLogin(email, password, await requestIp());
  if (!result.ok) return result;
  const session = await createSession(result.user.id);
  await writeSessionCookie(session.cookie, session.expiresAt);
  return result;
}

export async function logoutUser() {
  const cookie =
    process.env.VITEST === "true" ? testState.sessionToken : await currentCookie();
  await destroySessionCookie(cookie);
  await clearSessionCookie();
}

async function currentCookie() {
  const { cookies } = await import("next/headers");
  const { SESSION_COOKIE } = await import("@/lib/session-cookie");
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export async function gateMutation(): Promise<
  { ok: true; user: CurrentUser } | { ok: false; error: string }
> {
  if (!(await originAllowed())) return { ok: false, error: authCopy.csrfRejected };
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return { ok: true, user };
}

export async function gateManager(): Promise<
  { ok: true; user: CurrentUser } | { ok: false; error: string }
> {
  const gate = await gateMutation();
  if (!gate.ok) return gate;
  if (!canManageWorkspace(gate.user.role)) {
    return { ok: false, error: authCopy.manageDenied };
  }
  return gate;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function publicOrigin() {
  const configured = process.env.ULIXDESK_PUBLIC_ORIGIN?.replace(/\/$/, "");
  if (configured) return configured;
  const { requestHeader, trustedForwardedHost, trustedForwardedProto } = await import(
    "@/lib/request-headers"
  );
  const host = (await trustedForwardedHost()) || (await requestHeader("host"))?.trim();
  const proto = (await trustedForwardedProto()) || "http";
  if (!host) return "http://127.0.0.1:3000";
  return `${proto}://${host}`;
}
