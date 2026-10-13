/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { TeamPanel } from "@/app/team/team-panel";
import { authCopy } from "@/lib/auth-copy";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { signInAs } from "@/lib/test-actor";
import { prisma } from "@/lib/db";

let root: Root | null = null;

beforeEach(async () => {
  document.body.innerHTML = "";
  await resetTestDatabase();
});

describe("team refusal messages", () => {
  it("shows the self role and deactivate refusals", async () => {
    const owner = await signInAs("owner", "panel-owner@ulix.test");
    await render(
      createElement(TeamPanel, {
        actorId: owner.user.id,
        actorRole: "owner",
        people: [
          {
            id: owner.user.id,
            name: "Owner",
            email: "panel-owner@ulix.test",
            role: "owner",
            deactivated: false,
          },
        ],
      }),
    );

    const select = document.getElementById(`role-${owner.user.id}`) as HTMLSelectElement;
    select.value = "member";
    await submit(select.form!, authCopy.lastOwner);
    expect(document.body.textContent).toContain(authCopy.lastOwner);

    const deactivate = [...document.querySelectorAll("form")].find((form) =>
      form.querySelector('input[name="active"][value="0"]'),
    );
    await submit(deactivate!, authCopy.cannotDeactivateSelf);
    expect(document.body.textContent).toContain(authCopy.cannotDeactivateSelf);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } })).role).toBe(
      "owner",
    );
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } })).deactivatedAt,
    ).toBeNull();
  });

  it("shows that an admin cannot change an owner", async () => {
    const admin = await signInAs("admin", "panel-admin@ulix.test");
    const owner = await prisma.user.create({
      data: {
        email: "panel-target-owner@ulix.test",
        name: "Owner",
        role: "owner",
        passwordHash: "unused",
      },
    });
    await render(
      createElement(TeamPanel, {
        actorId: admin.user.id,
        actorRole: "admin",
        people: [
          {
            id: owner.id,
            name: "Owner",
            email: owner.email,
            role: "owner",
            deactivated: false,
          },
        ],
      }),
    );

    const select = document.getElementById(`role-${owner.id}`) as HTMLSelectElement;
    select.value = "member";
    await submit(select.form!, authCopy.cannotManageOwner);
    expect(document.body.textContent).toContain(authCopy.cannotManageOwner);
  });
});

async function render(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
}

async function submit(form: HTMLFormElement, text: string) {
  await act(async () => {
    form.requestSubmit();
  });
  const started = Date.now();
  while (Date.now() - started < 3000 && !document.body.textContent?.includes(text)) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}
