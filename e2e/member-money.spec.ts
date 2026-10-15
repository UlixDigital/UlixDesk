import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth";

/** Session cookies are long token runs. Drop them before looking for a currency code. */
function withoutTokens(html: string) {
  return html.replace(/[A-Za-z0-9_-]{16,}/g, " ");
}

function expectNoJpy(html: string) {
  expect(withoutTokens(html)).not.toMatch(/\bJPY\b/);
}

test("a member page response does not include a client's currency", async ({ browser }) => {
  const prisma = new PrismaClient();
  const member = await prisma.user.create({
    data: {
      email: "member-money@ulix.test",
      name: "Money Member",
      role: "member",
      passwordHash: "unused",
    },
  });
  const client = await prisma.client.create({
    data: { name: "Secret Currency Co", currency: "JPY" },
  });
  const context = await browser.newContext();
  try {
    await signIn(context, prisma, member.email);
    const page = await context.newPage();
    const response = await page.goto("/clients");
    expect(response?.status()).toBe(200);
    const html = await response?.text();
    expectNoJpy(html ?? "");
    expect(html ?? "").not.toContain("currency");
    await expect(page.getByText("Secret Currency Co")).toBeVisible();
    await expect(page.getByText("JPY")).toHaveCount(0);

    const edit = await page.goto(`/clients/${client.id}/edit`);
    expect(edit?.status()).toBe(200);
    const editHtml = await edit?.text();
    expectNoJpy(editHtml ?? "");
    expect(editHtml ?? "").not.toContain("Hourly bill rate");
    await expect(page.getByText("You don't have permission to manage clients and projects.")).toBeVisible();
  } finally {
    await context.close();
    await prisma.session.deleteMany({ where: { userId: member.id } });
    await prisma.client.delete({ where: { id: client.id } });
    await prisma.user.delete({ where: { id: member.id } });
    await prisma.$disconnect();
  }
});
