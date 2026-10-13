import { defineConfig, devices } from "@playwright/test";
import { e2eDatabaseUrl, e2eEmail, e2eOrigin, e2ePassword, e2ePort, e2eSessionSecret } from "./e2e/env";

process.env.DATABASE_URL = e2eDatabaseUrl;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: e2eOrigin,
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
  webServer: {
    // Plugin setup starts the server before globalSetup, so the test database
    // has to exist before Next opens SQLite. Reset and migrate here.
    command: `npx prisma migrate reset --force --skip-seed && node scripts/bootstrap-owner.mjs && npm run dev -- --hostname 127.0.0.1 --port ${e2ePort}`,
    url: e2eOrigin,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: e2eDatabaseUrl,
      ULIXDESK_APP_HOSTS: "desk.example.com",
      ULIXDESK_EXTENSION_IDS: "cjlaoflbipaehclleojofopapalhiooe",
      ULIXDESK_SESSION_SECRET: e2eSessionSecret,
      ULIXDESK_BOOTSTRAP_EMAIL: e2eEmail,
      ULIXDESK_BOOTSTRAP_PASSWORD: e2ePassword,
      ULIXDESK_BOOTSTRAP_NAME: "E2E Owner",
    },
  },
});
