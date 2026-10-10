import { describe, expect, it } from "vitest";
import { extensionCorsHeaders, isChromeExtensionOrigin } from "@/lib/extension-cors";

function headers(origin?: string) {
  return {
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "origin") return origin ?? null;
        return null;
      },
    },
  };
}

describe("extension CORS", () => {
  it("reflects a chrome-extension origin and ignores every other origin", () => {
    const origin = "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef";
    expect(isChromeExtensionOrigin(origin)).toBe(true);
    expect(isChromeExtensionOrigin("https://evil.test")).toBe(false);
    expect(isChromeExtensionOrigin("chrome-extension://")).toBe(false);
    expect(isChromeExtensionOrigin("http://chrome-extension.example")).toBe(false);

    const allowed = extensionCorsHeaders(headers(origin));
    expect(allowed.get("access-control-allow-origin")).toBe(origin);
    expect(allowed.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
    expect(allowed.get("access-control-allow-headers")).toBe("Authorization, Content-Type");
    expect(allowed.get("vary")).toBe("Origin");

    expect(extensionCorsHeaders(headers("https://evil.test")).get("access-control-allow-origin")).toBeNull();
    expect(extensionCorsHeaders(headers()).get("access-control-allow-origin")).toBeNull();
    expect(extensionCorsHeaders(headers("http://localhost:3000")).get("access-control-allow-origin")).toBeNull();
  });
});
