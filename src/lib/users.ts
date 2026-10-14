import { createHash, randomBytes } from "node:crypto";
import { SETUP_TTL_MS, authCopy } from "@/lib/auth-copy";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  clearPasswordFailures,
  passwordChangeLimited,
  recordPasswordFailure,
} from "@/lib/rate-limit";
import {
  assignableRoles,
  canManageTarget,
  validateEmail,
  validatePersonName,
  type UserRole,
} from "@/lib/users-validation";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export type TeamUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  deactivatedAt: Date | null;
  createdAt: Date;
};

export async function listTeam(): Promise<TeamUser[]> {
  return prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      deactivatedAt: true,
      createdAt: true,
    },
  });
}

export async function listActiveUsers() {
  return prisma.user.findMany({
    where: { deactivatedAt: null },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true, role: true },
  });
}

async function issueSetupToken(userId: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  await prisma.passwordSetup.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: now },
  });
  await prisma.passwordSetup.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(now.getTime() + SETUP_TTL_MS),
    },
  });
  return token;
}

export function setupLink(origin: string, token: string) {
  const url = new URL("/set-password", origin.endsWith("/") ? origin : `${origin}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function createTeamMember(input: {
  actor: { id: string; role: string };
  name: string;
  email: string;
  role: string;
}) {
  if (!assignableRoles(input.actor.role).includes(input.role as UserRole)) {
    return { ok: false as const, error: authCopy.teamDenied };
  }
  const name = validatePersonName(input.name);
  if (!name.ok) return { ok: false as const, error: name.error };
  const email = validateEmail(input.email);
  if (!email.ok) return { ok: false as const, error: email.error };
  const existing = await prisma.user.findUnique({ where: { email: email.email } });
  if (existing) return { ok: false as const, error: authCopy.emailTaken };
  const user = await prisma.user.create({
    data: { name: name.name, email: email.email, role: input.role },
  });
  const token = await issueSetupToken(user.id);
  return { ok: true as const, user, token };
}

export async function resetTeamPassword(input: {
  actor: { id: string; role: string };
  userId: string;
}) {
  const target = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!target) return { ok: false as const, error: authCopy.setupInvalid };
  if (!canManageTarget(input.actor, target)) {
    return { ok: false as const, error: authCopy.cannotManageOwner };
  }
  const token = await issueSetupToken(target.id);
  return { ok: true as const, token, email: target.email };
}

export async function setTeamRole(input: {
  actor: { id: string; role: string };
  userId: string;
  role: string;
}) {
  if (!assignableRoles(input.actor.role).includes(input.role as UserRole)) {
    return { ok: false as const, error: authCopy.teamDenied };
  }
  const target = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!target) return { ok: false as const, error: authCopy.createFailed };
  if (!canManageTarget(input.actor, target)) {
    return { ok: false as const, error: authCopy.cannotManageOwner };
  }
  if (target.role === "owner" && input.role !== "owner") {
    const others = await prisma.user.count({
      where: { role: "owner", deactivatedAt: null, id: { not: target.id } },
    });
    if (others === 0) return { ok: false as const, error: authCopy.lastOwner };
  }
  if (input.actor.id === target.id) {
    return { ok: false as const, error: authCopy.cannotChangeOwnRole };
  }
  await prisma.user.update({ where: { id: target.id }, data: { role: input.role } });
  return { ok: true as const };
}

export async function setUserActive(input: {
  actor: { id: string; role: string };
  userId: string;
  active: boolean;
}) {
  const target = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!target) return { ok: false as const, error: authCopy.createFailed };
  if (input.actor.id === target.id) {
    return { ok: false as const, error: authCopy.cannotDeactivateSelf };
  }
  if (!canManageTarget(input.actor, target)) {
    return { ok: false as const, error: authCopy.cannotManageOwner };
  }
  if (!input.active && target.role === "owner" && !target.deactivatedAt) {
    const others = await prisma.user.count({
      where: { role: "owner", deactivatedAt: null, id: { not: target.id } },
    });
    if (others === 0) return { ok: false as const, error: authCopy.lastOwner };
  }
  const now = new Date();
  if (input.active) {
    await prisma.user.update({ where: { id: target.id }, data: { deactivatedAt: null } });
    return { ok: true as const };
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { deactivatedAt: now } }),
    prisma.session.deleteMany({ where: { userId: target.id } }),
    prisma.accessToken.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.extensionSession.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.passwordSetup.updateMany({
      where: { userId: target.id, usedAt: null },
      data: { usedAt: now },
    }),
  ]);
  return { ok: true as const };
}

export async function changeOwnPassword(input: {
  userId: string;
  currentPassword: string;
  nextPassword: string;
  keepSessionTokenHash: string | null;
  now?: number;
}) {
  const nowMs = input.now ?? Date.now();
  if (passwordChangeLimited(input.userId, nowMs).limited) {
    return { ok: false as const, error: authCopy.passwordRateLimited };
  }
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user?.passwordHash) {
    recordPasswordFailure(input.userId, nowMs);
    return { ok: false as const, error: authCopy.currentPasswordWrong };
  }
  const matches = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!matches) {
    recordPasswordFailure(input.userId, nowMs);
    return { ok: false as const, error: authCopy.currentPasswordWrong };
  }
  clearPasswordFailures(input.userId);
  const now = new Date(nowMs);
  const passwordHash = await hashPassword(input.nextPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    }),
    prisma.session.deleteMany({
      where: input.keepSessionTokenHash
        ? { userId: user.id, tokenHash: { not: input.keepSessionTokenHash } }
        : { userId: user.id },
    }),
    prisma.extensionSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  return { ok: true as const };
}

export async function lookupSetupToken(token: string, now = new Date()) {
  if (!token || token.length > 200) return null;
  const row = await prisma.passwordSetup.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true, deactivatedAt: true } } },
  });
  if (!row || row.usedAt || row.expiresAt <= now || row.user.deactivatedAt) return null;
  return row;
}

export async function consumeSetupToken(token: string, password: string, now = new Date()) {
  const row = await lookupSetupToken(token, now);
  if (!row) return { ok: false as const, error: authCopy.setupInvalid };
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    prisma.passwordSetup.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.session.deleteMany({ where: { userId: row.userId } }),
    prisma.extensionSession.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  return { ok: true as const };
}
