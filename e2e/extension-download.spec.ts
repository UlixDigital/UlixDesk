import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { zipEntries } from "../extension/zip.mjs";
import { signIn } from "./auth";
import { e2eEmail, e2eOrigin, e2ePassword } from "./env";

const shots = process.env.ULIXDESK_SCREENSHOT_DIR;

function readMeta() {
  return JSON.parse(readFileSync(path.resolve("extension/extension-build.json"), "utf8")) as {
    version: string;
    builtAt: string;
  };
}

test("the installation guide is public", async ({ page, request }) => {
  const meta = readMeta();
  const version = await request.get("/api/extension/version", { maxRedirects: 0 });
  expect(version.status()).toBe(200);
  expect(await version.json()).toMatchObject({
    available: true,
    version: meta.version,
    builtAt: meta.builtAt,
  });

  await page.goto("/help/extension");
  await expect(page).toHaveURL("/help/extension");
  await expect(
    page.getByRole("heading", { level: 1, name: "Install the UlixDesk Chrome extension" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Troubleshooting" })).toBeVisible();
  await expect(page.getByText("Deleting the folder removes the extension.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wrong folder" })).toBeVisible();
  await expect(page.getByText("Sign-in fails when the server URL is wrong.")).toBeVisible();
  await expect(page.getByRole("img", { name: /Developer mode switched on/ })).toBeVisible();
  if (shots) {
    await page.screenshot({ path: path.join(shots, "extension-guide.png"), fullPage: true });
  }
});

test("signed-in staff can download the extension from Settings", async ({ page }) => {
  const meta = readMeta();
  const unsigned = await page.request.get("/api/extension/download", { maxRedirects: 0 });
  expect([301, 302, 303, 307, 308, 401]).toContain(unsigned.status());
  if (unsigned.status() !== 401) {
    expect(unsigned.headers().location ?? "").toContain("/login");
  }

  await page.goto("/login");
  await page.locator("#email").fill(e2eEmail);
  await page.locator("#password").fill(e2ePassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();

  await page.goto("/settings");
  const card = page.locator("#chrome-extension");
  await expect(card.getByRole("heading", { name: "Chrome extension" })).toBeVisible();
  await expect(card.getByText(meta.version)).toBeVisible();
  await expect(card.getByText("Unpacked extensions don't auto-update.")).toBeVisible();
  await expect(card.getByText("Sign in with your server URL, email and password.")).toBeVisible();
  await expect(card.getByRole("link", { name: "Download" })).toHaveAttribute("href", "/api/extension/download");
  await expect(card.getByRole("link", { name: "Installation guide" })).toHaveAttribute("href", "/help/extension");
  if (shots) {
    await card.screenshot({ path: path.join(shots, "extension-card.png") });
  }

  const download = await page.request.get("/api/extension/download");
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"] ?? "").toContain("application/zip");
  const body = await download.body();
  expect(body.subarray(0, 4).toString("hex")).toBe("504b0304");
  expect(body.includes(Buffer.from("INSTALL.txt"))).toBe(true);
  expect(body.includes(Buffer.from("manifest.json"))).toBe(true);
  const baked = zipEntries(body).find((entry) => entry.name === "default-server.json");
  expect(JSON.parse(baked?.data.toString("utf8") ?? "{}").serverUrl).toBe(e2eOrigin);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card.getByRole("heading", { name: "Chrome extension" })).toBeVisible();
  await expect(card.getByRole("link", { name: "Download" })).toBeVisible();

  await card.getByRole("link", { name: "Installation guide" }).click();
  await expect(page).toHaveURL("/help/extension");
  await expect(page.getByRole("heading", { name: "Turn on Developer mode" })).toBeVisible();
});

test("a member can open the extension card", async ({ browser }) => {
  const prisma = new PrismaClient();
  const member = await prisma.user.create({
    data: {
      email: "extension-card-member@ulix.test",
      name: "Extension Member",
      role: "member",
      passwordHash: "unused",
    },
  });
  const context = await browser.newContext();
  try {
    const meta = readMeta();
    await signIn(context, prisma, member.email);
    const page = await context.newPage();
    await page.goto("/settings");
    const card = page.locator("#chrome-extension");
    await expect(card.getByRole("heading", { name: "Chrome extension" })).toBeVisible();
    await expect(card.getByText(meta.version)).toBeVisible();
    const download = await page.request.get("/api/extension/download");
    expect(download.status()).toBe(200);
    expect((await download.body()).includes(Buffer.from("INSTALL.txt"))).toBe(true);
  } finally {
    await context.close();
    await prisma.session.deleteMany({ where: { userId: member.id } });
    await prisma.user.delete({ where: { id: member.id } });
    await prisma.$disconnect();
  }
});
