import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const dist = path.resolve("extension/dist");

type PopupFixture = {
  lastProjectId: string;
  timer: {
    id: string;
    projectId: string;
    projectName: string;
    clientName: string | null;
    startedAt: string;
    billable: boolean;
    note: null;
    source: string;
  } | null;
};

function contentType(file: string) {
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "text/html; charset=utf-8";
}

async function servePopup() {
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const relative = pathname === "/" ? "popup.html" : pathname.replace(/^\/+/, "");
    const file = path.resolve(dist, relative);
    if (!file.startsWith(`${dist}${path.sep}`) && file !== dist) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, { "content-type": contentType(file) });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Popup server did not bind.");
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function openPopup(page: Page, origin: string, fixture: PopupFixture) {
  const settings = {
    serverUrl: "http://127.0.0.1:3000",
    token: "ulixdesk_secret",
    refreshToken: "",
    accessExpiresAt: "",
    userName: "Alex Rivera",
    userEmail: "alex@ulix.test",
    lastProjectId: fixture.lastProjectId,
  };
  await page.addInitScript(
    ({ stored, timer }) => {
      const chromeStub = {
        runtime: {
          lastError: undefined,
          getManifest: () => ({ version: "0.1.0" }),
          getURL: (value: string) => value,
          openOptionsPage: () => undefined,
          sendMessage: (message: { type?: string }, callback?: (result: unknown) => void) => {
            if (message?.type === "ensure-access") callback?.({ ok: true, settings: stored });
            else callback?.({ ok: true });
          },
        },
        permissions: {
          contains: async () => true,
          request: (_request: unknown, callback?: (granted: boolean) => void) => callback?.(true),
        },
        storage: {
          local: {
            get: async () => stored,
            set: async (patch: Record<string, string>) => {
              Object.assign(stored, patch);
            },
          },
        },
      };
      Object.assign(globalThis, { chrome: chromeStub });
      const projects = [
        { id: "internal", name: "Internal", billable: false, client: null },
        {
          id: "website",
          name: "Website",
          billable: true,
          client: { id: "wsi", name: "WSI Web Enhancers" },
        },
      ];
      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        const json = (body: unknown) =>
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        if (url.endsWith("/api/projects")) return json({ projects });
        if (url.endsWith("/api/timer")) return json({ timer });
        if (url.includes("/api/extension/session")) {
          return json({ user: { name: stored.userName, email: stored.userEmail } });
        }
        if (url.includes("/api/todos")) return json({ todos: [] });
        if (url.endsWith("/api/extension/version")) {
          return json({ version: "0.1.0", builtAt: "2026-11-26T00:00:00.000Z" });
        }
        return json({});
      };
    },
    { stored: settings, timer: fixture.timer },
  );
  await page.setViewportSize({ width: 400, height: 720 });
  await page.goto(`${origin}/popup.html`);
}

test.describe("extension popup client line", () => {
  let server: Server;
  let origin = "";

  test.beforeAll(async () => {
    const served = await servePopup();
    server = served.server;
    origin = served.origin;
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  test("updates the client under the project dropdown and hides it when there is none", async ({ page }) => {
    await openPopup(page, origin, { lastProjectId: "website", timer: null });
    await expect(page.locator("#project option:checked")).toHaveText("Website · WSI Web Enhancers");
    await expect(page.locator("#project-client")).toHaveText("Client WSI Web Enhancers");
    await expect(page.getByText("No open to-dos yet.")).toBeVisible();
    const projectBox = await page.locator("#project").boundingBox();
    const clientBox = await page.locator("#project-client").boundingBox();
    expect(projectBox && clientBox && clientBox.y > projectBox.y).toBe(true);

    await page.locator("#project").selectOption({ label: "Internal" });
    await expect(page.locator("#project option:checked")).toHaveText("Internal");
    await expect(page.locator("#project-client")).toHaveCount(0);

    await page.locator("#project").selectOption({ label: "Website · WSI Web Enhancers" });
    await expect(page.locator("#project-client")).toHaveText("Client WSI Web Enhancers");
  });

  test("keeps the client visible when the popup opens onto a running timer", async ({ page }) => {
    await openPopup(page, origin, {
      lastProjectId: "website",
      timer: {
        id: "timer-1",
        projectId: "website",
        projectName: "Website",
        clientName: "WSI Web Enhancers",
        startedAt: "2026-11-26T09:00:00.000Z",
        billable: true,
        note: null,
        source: "timer",
      },
    });
    await expect(page.getByText("A timer is already running.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Website" })).toBeVisible();
    await expect(page.locator("#project-client")).toHaveText("Client WSI Web Enhancers");
    await expect(page.locator("#project")).toHaveCount(0);
  });
});
