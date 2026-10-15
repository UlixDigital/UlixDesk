import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { BrowserContext } from "@playwright/test";
import { SESSION_COOKIE, signSessionCookie } from "../src/lib/session-cookie";
import { e2eEmail, e2eOrigin, e2eSessionSecret } from "./env";

/** Puts a server-side session cookie on the browser context for the bootstrap owner. */
export async function signIn(context: BrowserContext, prisma: PrismaClient, email = e2eEmail) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const now = new Date();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
      rotatedAt: now,
    },
  });
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: await signSessionCookie(token, e2eSessionSecret),
      url: e2eOrigin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return user;
}
