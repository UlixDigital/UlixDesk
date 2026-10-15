import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    globalSetup: ["./vitest.global-setup.ts"],
    globalSetupTimeout: 60_000,
    testTimeout: 20_000,
    env: {
      DATABASE_URL: "postgresql://ulixdesk:ulixdesk@127.0.0.1:5432/ulixdesk_test",
      ULIXDESK_SESSION_SECRET: "test-session-secret-at-least-32-characters",
      INVOICE_LINK_KEY: "ASNFZ4mrze8BI0VniavN7wEjRWeJq83vASNFZ4mrze8=",
      ULIXDESK_EXTENSION_IDS: "abcdefghijklmnopabcdefghijklmnop",
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "extension/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
