import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("standalone image serves the public logo", () => {
  it("copies public/ next to the standalone server", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    const runner = dockerfile.split("FROM node:22-bookworm-slim AS runner")[1] ?? "";
    expect(runner.length).toBeGreaterThan(0);
    expect(runner).toMatch(/COPY --from=build --chown=nextjs:nodejs \/app\/public \.\/public/);
    expect(runner).toContain("test -s /app/public/ulix-logo.svg");
    expect(readFileSync("public/ulix-logo.svg", "utf8").trimStart().startsWith("<svg")).toBe(true);
  });
});
