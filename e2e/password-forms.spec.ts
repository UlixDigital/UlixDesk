import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth";
import { e2eDatabaseUrl, e2eEmail, e2ePassword } from "./env";

if (process.env.DATABASE_URL !== e2eDatabaseUrl) {
  throw new Error(`e2e must use ${e2eDatabaseUrl}, got ${process.env.DATABASE_URL ?? "(unset)"}`);
}

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("sign-in, set-password, and change-password submit without JavaScript", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto("/login");
  await page.locator("#email").fill(e2eEmail);
  await page.locator("#password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("p[role='alert']")).toHaveText("That email or password is incorrect.");

  await page.locator("#password").fill(e2ePassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();

  const token = await setupToken("noscript-member@ulix.test");
  await page.goto(`/set-password?token=${encodeURIComponent(token)}`);
  await expect(page.getByRole("heading", { name: "Set your password" })).toBeVisible();
  await page.locator("#password").fill("new-password-10");
  await page.locator("#confirm").fill("different-password");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("Those passwords don't match.")).toBeVisible();
  expect(page.url()).not.toContain("password=");

  await page.locator("#password").fill("new-password-10");
  await page.locator("#confirm").fill("new-password-10");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("Password saved. Sign in.")).toBeVisible();

  await signIn(context, prisma);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Change password" })).toBeVisible();
  await page.locator("#current-password").fill("wrong-password");
  await page.locator("#new-password").fill("changed-password-10");
  await page.locator("#confirm-password").fill("changed-password-10");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("That password is incorrect.")).toBeVisible();

  await page.locator("#current-password").fill(e2ePassword);
  await page.locator("#new-password").fill("changed-password-10");
  await page.locator("#confirm-password").fill("changed-password-10");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(
    page.getByText("Password changed. Extension sign-ins and access tokens were revoked."),
  ).toBeVisible();

  await page.locator("#current-password").fill("changed-password-10");
  await page.locator("#new-password").fill(e2ePassword);
  await page.locator("#confirm-password").fill(e2ePassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(
    page.getByText("Password changed. Extension sign-ins and access tokens were revoked."),
  ).toBeVisible();

  await context.close();
});

test("a set-password link signs out whoever is already signed in", async ({ page }) => {
  await signIn(page.context(), prisma);
  const token = await setupToken("link-member@ulix.test");
  await page.goto(`/set-password?token=${encodeURIComponent(token)}`);
  await expect(page).toHaveURL(/\/set-password\?/);
  await expect(page).not.toHaveURL(/\/clients/);
  await expect(page.getByRole("heading", { name: "Set your password" })).toBeVisible();
  await expect(page.getByText("You were signed out so this password link can be used.")).toBeVisible();
  await expect(page.getByText("Choose a password for link-member@ulix.test.")).toBeVisible();

  await page.goto("/clients");
  await expect(page).toHaveURL(/\/login/);
});

async function setupToken(email: string) {
  const user = await prisma.user.create({
    data: { email, name: "New Member", role: "member" },
  });
  const token = randomBytes(32).toString("base64url");
  await prisma.passwordSetup.create({
    data: {
      userId: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    },
  });
  return token;
}
