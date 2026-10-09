import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    globalSetup: ["./vitest.global-setup.ts"],
    globalSetupTimeout: 60_000,
    testTimeout: 20_000,
    env: {
      DATABASE_URL: "file:./test.db",
    },
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
