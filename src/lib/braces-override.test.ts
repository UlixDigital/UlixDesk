import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const braces = require("braces") as {
  (input: string, options?: { expand?: boolean }): string[];
  parse: (input: string) => unknown;
  expand: (input: string) => string[];
};

describe("braces override", () => {
  it("keeps the upstream 3.0.3 version and the local depth guard", () => {
    const pkg = require("braces/package.json") as { version: string };
    expect(pkg.version).toBe("3.0.3");
  });

  it("still expands ordinary patterns used by the lint globber", () => {
    expect(braces("a/{b,c}/d", { expand: true })).toEqual(["a/b/d", "a/c/d"]);
    expect(braces.expand("src/**/*.{ts,tsx}")).toEqual(["src/**/*.ts", "src/**/*.tsx"]);
  });

  it("rejects nesting past the depth guard instead of walking until the stack overflows", () => {
    const pattern = "{".repeat(101) + "a,b" + "}".repeat(101);
    expect(() => braces.parse(pattern)).toThrow(/exceeds max depth/);
  });
});
