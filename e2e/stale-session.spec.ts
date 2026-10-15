import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signIn } from "./auth";
import { e2eDatabaseUrl, e2eOrigin, e2eSessionSecret } from "./env";
import { SESSION_COOKIE, signSessionCookie } from "../src/lib/session-cookie";

if (process.env.DATABASE_URL !== e2eDatabaseUrl) {
  throw new Error(`e2e must use ${e2eDatabaseUrl}, got ${process.env.DATABASE_URL ?? "(unset)"}`);
}

const prisma = new PrismaClient();

/** Every page that requires a session, plus sign-in. Dynamic routes use a missing id. */
const pages = [
  "/",
  "/clients",
  "/clients/new",
  "/clients/missing-client/edit",
  "/projects",
  "/projects/new",
  "/projects/missing-project/edit",
  "/timesheets",
  "/timesheets/new",
  "/timesheets/missing-entry/edit",
  "/settings",
  "/team",
  "/login",
];

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("an invalid, expired, or deactivated session cookie signs every page out", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@ulix.test" } });

  for (const path of pages) {
    await showCookie(page.context(), "not-a-signed-cookie");
    await expectSignedOut(page, path);
  }

  for (const path of pages) {
    await showCookie(page.context(), await sessionCookie(owner.id, { expiresAt: past() }));
    await expectSignedOut(page, path);
  }

  const member = await prisma.user.create({
    data: { email: "stale-member@ulix.test", name: "Stale Member", role: "member", deactivatedAt: new Date() },
  });
  for (const path of pages) {
    await showCookie(page.context(), await sessionCookie(member.id));
    await expectSignedOut(page, path);
  }
});

test("a session older than 15 minutes still opens after the container would have restarted", async ({
  page,
}) => {
  // Two refreshes used to both pass the 15-minute check and replace tokenHash.
  // The loser, or the next navigation still holding the old cookie, looked
  // signed out, and the refresh route then cleared the cookie. Rotation is now
  // compare-and-swap, and the previous token stays valid for 60 seconds.
  // This test also sets the timezone cookie so TimezoneSync does not refresh
  // the router, and waits until the page is idle before aging the session again.
  test.setTimeout(120_000);
  const owner = await signIn(page.context(), prisma);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const timeZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  await page.context().addCookies([
    {
      name: "ulixdesk-timezone",
      value: timeZone,
      url: e2eOrigin,
      sameSite: "Lax",
    },
  ]);
  for (const path of pages) {
    await prisma.session.updateMany({
      where: { userId: owner.id },
      data: {
        rotatedAt: new Date(Date.now() - 20 * 60 * 1000),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    expect(response?.status() ?? 0, path).toBeLessThan(500);
    await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);
    expect(page.url()).not.toContain("Application error");
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === SESSION_COOKIE)).toBe(true);
  }
});

async function expectSignedOut(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status() ?? 0, path).toBeLessThan(500);
  await expect(page, path).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === SESSION_COOKIE), path).toBe(false);
}

async function showCookie(context: BrowserContext, value: string) {
  await context.clearCookies();
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value,
      url: e2eOrigin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function sessionCookie(userId: string, options?: { expiresAt?: Date }) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      createdAt: now,
      lastSeenAt: now,
      rotatedAt: now,
      expiresAt: options?.expiresAt ?? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  return signSessionCookie(token, e2eSessionSecret);
}

function past() {
  return new Date(Date.now() - 60_000);
}
