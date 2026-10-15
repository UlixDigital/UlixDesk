import { PASSWORD_MIN, USER_NAME_MAX, authCopy } from "@/lib/auth-copy";

export type UserRole = "owner" | "admin" | "member";

export function isUserRole(value: string): value is UserRole {
  return value === "owner" || value === "admin" || value === "member";
}

export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export function validateEmail(raw: string) {
  const email = normalizeEmail(raw);
  if (!email) return { ok: false as const, error: authCopy.emailRequired };
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, error: authCopy.emailInvalid };
  }
  return { ok: true as const, email };
}

export function validatePersonName(raw: string) {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false as const, error: authCopy.nameRequired };
  if (name.length > USER_NAME_MAX) return { ok: false as const, error: authCopy.nameTooLong };
  return { ok: true as const, name };
}

export function validateNewPassword(password: string, confirm: string) {
  if (!password) return authCopy.passwordRequired;
  if (password.length < PASSWORD_MIN) return authCopy.passwordTooShort;
  if (password !== confirm) return authCopy.passwordMismatch;
  return null;
}

export function canManageWorkspace(role: string) {
  return role === "owner" || role === "admin";
}

/** Owners and admins can see and edit bill rates and amounts. Members cannot. */
export function canSeeMoney(role: string) {
  return canManageWorkspace(role);
}

export function roleLabel(role: string) {
  if (role === "owner") return authCopy.roleOwner;
  if (role === "admin") return authCopy.roleAdmin;
  return authCopy.roleMember;
}

/** Roles the actor may assign. Admins cannot create or edit owners. */
export function assignableRoles(actorRole: string): UserRole[] {
  if (actorRole === "owner") return ["owner", "admin", "member"];
  if (actorRole === "admin") return ["admin", "member"];
  return [];
}

export function canManageTarget(actor: { id: string; role: string }, target: { id: string; role: string }) {
  if (actor.role === "member") return false;
  if (actor.role === "admin" && target.role === "owner") return false;
  if (actor.role === "owner" || actor.role === "admin") return true;
  return false;
}
