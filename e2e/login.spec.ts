import { expect, test } from "@playwright/test";
import { e2eEmail, e2ePassword } from "./env";

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
  await expect(page.getByRole("alert")).toHaveText("That email or password is incorrect.");

  await page.locator("#password").fill(e2ePassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("You have signed out.")).toBeVisible();
  await page.goto("/timesheets");
  await expect(page).toHaveURL(/\/login/);
});
