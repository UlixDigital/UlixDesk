import { expect, test } from "@playwright/test";
import { e2eEmail, e2ePassword } from "./env";

test("signed-out pages load the logo and icons", async ({ page, request }) => {
  await page.goto("/login");
  const logo = page.getByRole("img", { name: "Ulix" });
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  const icon = await request.get("/icon.svg", { maxRedirects: 0 });
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"] ?? "").toContain("image/svg");

  const favicon = await request.get("/favicon.ico", { maxRedirects: 0 });
  expect(favicon.status()).not.toBe(404);
  expect(favicon.status()).toBeLessThan(400);
});

test("a future image path stays behind sign-in", async ({ page }) => {
  await page.goto("/future-route.svg");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/reports/chart.png");
  await expect(page).toHaveURL(/\/login/);
});

test("the image optimizer is denied without a session", async ({ request }) => {
  const response = await request.get("/_next/image?url=%2Fulix-logo.svg&w=48&q=75", {
    maxRedirects: 0,
  });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  const location = response.headers().location ?? "";
  expect(location).toContain("/login");
  expect(new URL(location, "http://127.0.0.1:3100").pathname).toBe("/login");
  expect(response.headers()["content-type"] ?? "").not.toContain("image/");
});

test("sends a signed-out visit to sign-in, then accepts the owner password", async ({ page }) => {
  await page.goto("/clients");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByText("UlixDesk is for Ulix Digital staff. There is no public signup."),
  ).toBeVisible();

  await page.locator("#email").fill(e2eEmail);
  await page.locator("#password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("p[role='alert']")).toHaveText(
    "That email or password is incorrect.",
  );

  await page.locator("#password").fill(e2ePassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("You have signed out.")).toBeVisible();
  await page.goto("/timesheets");
  await expect(page).toHaveURL(/\/login/);
});

test("the mobile menu opens from the keyboard and closes with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.locator("#email").fill(e2eEmail);
  await page.locator("#password").fill(e2ePassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();

  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
});
