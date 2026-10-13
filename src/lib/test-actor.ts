import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import type { UserRole } from "@/lib/users-validation";

export async function createTestUser(
  role: UserRole = "member",
  email = `${role}@ulix.test`,
) {
  return prisma.user.create({
    data: {
      email,
      name: role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member",
      role,
      passwordHash: await hashPassword("test-password-10"),
    },
  });
}

/** Creates a user and stores their session cookie for later server actions. */
export async function signInAs(role: UserRole = "owner", email?: string) {
  const user = await createTestUser(role, email ?? `${role}-${Date.now()}@ulix.test`);
  const session = await createSession(user.id);
  const { setTestSessionToken } = await import("@/lib/test-hooks");
  setTestSessionToken(session.cookie);
  return { user, cookie: session.cookie, password: "test-password-10" };
}
