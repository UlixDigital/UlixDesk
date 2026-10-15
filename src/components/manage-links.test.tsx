/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { ProjectRecord } from "@/lib/projects";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import { ClientsList } from "@/components/clients-list";
import { ProjectsList } from "@/components/projects-list";

const project: ProjectRecord = {
  id: "project-1",
  name: "Website",
  description: null,
  billable: true,
  clientId: "client-1",
  client: { id: "client-1", name: "Acme", archivedAt: null },
  archivedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("member list links", () => {
  it("hides edit client and edit project links from members", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          "div",
          null,
          createElement(ClientsList, {
            clients: [{ id: "client-1", name: "Acme", address: null, phone: null, emails: [] }],
            archived: false,
            canManage: false,
          }),
          createElement(ProjectsList, { projects: [project], archived: false, canManage: false }),
        ),
      );
    });

    expect(container.textContent).toContain("Acme");
    expect(container.textContent).toContain("Website");
    expect(container.querySelector('a[href="/clients/client-1/edit"]')).toBeNull();
    expect(container.querySelector('a[href="/projects/project-1/edit"]')).not.toBeNull();
    expect(container.textContent).not.toContain("edit client");
    expect(container.textContent).not.toContain("edit project");
    expect(container.textContent).toContain("view project");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
