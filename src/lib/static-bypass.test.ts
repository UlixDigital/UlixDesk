import { describe, expect, it } from "vitest";
import { config } from "@/middleware";
import { isStaticBypass, PUBLIC_ASSET_PATHS } from "@/lib/static-bypass";

describe("static bypass", () => {
  it("allows next assets and the known public files only", () => {
    expect(isStaticBypass("/_next/static/chunks/app.js")).toBe(true);
    expect(isStaticBypass("/_next/image")).toBe(true);
    for (const path of PUBLIC_ASSET_PATHS) {
      expect(isStaticBypass(path)).toBe(true);
    }
    expect(isStaticBypass("/future-route.svg")).toBe(false);
    expect(isStaticBypass("/reports/chart.png")).toBe(false);
    expect(isStaticBypass("/invoices/acme.webp")).toBe(false);
    expect(isStaticBypass("/clients")).toBe(false);
  });

  it("does not skip middleware for every image extension", () => {
    const matcher = config.matcher.join(" ");
    expect(matcher).not.toContain("svg|png");
    expect(matcher).not.toContain("webp");
    expect(matcher).toContain("_next/static");
    expect(matcher).toContain("_next/image");
    expect(matcher).toContain("favicon\\.ico");
    expect(matcher).toContain("icon\\.svg");
    expect(matcher).toContain("ulix-logo\\.svg");
  });
});
