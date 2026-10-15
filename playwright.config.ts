import { defineConfig, devices } from "@playwright/test";
import {
  e2eDatabaseUrl,
  e2eEmail,
  e2eInvoiceLinkKey,
  e2eOrigin,
  e2ePassword,
  e2ePort,
  e2eSessionSecret,
} from "./e2e/env";

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
    // Reset the e2e database before Next starts. The URL is ulixdesk_e2e only.
    command: `node --input-type=module -e "import { Client } from 'pg'; const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); await c.query('DROP SCHEMA IF EXISTS public CASCADE'); await c.query('CREATE SCHEMA public'); await c.end();" && npx prisma migrate deploy && node scripts/bootstrap-owner.mjs && npm run dev -- --hostname 127.0.0.1 --port ${e2ePort}`,
    url: e2eOrigin,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: e2eDatabaseUrl,
      ULIXDESK_APP_HOSTS: "desk.example.com",
      ULIXDESK_EXTENSION_IDS: "cjlaoflbipaehclleojofopapalhiooe",
      ULIXDESK_SESSION_SECRET: e2eSessionSecret,
      INVOICE_LINK_KEY: e2eInvoiceLinkKey,
      ...(process.env.ULIXDESK_INVOICE_MAIL_CAPTURE === "1" ? { ULIXDESK_INVOICE_MAIL_CAPTURE: "1" } : {}),
      ULIXDESK_BOOTSTRAP_EMAIL: e2eEmail,
      ULIXDESK_BOOTSTRAP_PASSWORD: e2ePassword,
      ULIXDESK_BOOTSTRAP_NAME: "E2E Owner",
    },
  },
});
