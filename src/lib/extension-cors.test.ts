import { afterEach, describe, expect, it } from "vitest";
import { extensionCorsHeaders, isChromeExtensionOrigin } from "@/lib/extension-cors";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const previousIds = process.env.ULIXDESK_EXTENSION_IDS;

afterEach(() => {
  if (previousIds === undefined) delete process.env.ULIXDESK_EXTENSION_IDS;
  else process.env.ULIXDESK_EXTENSION_IDS = previousIds;
});

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
  it("reflects an allowlisted chrome-extension id and ignores every other origin", () => {
    process.env.ULIXDESK_EXTENSION_IDS = `${EXTENSION_ID}, not-an-id`;
    const origin = `chrome-extension://${EXTENSION_ID}`;
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
    expect(
      extensionCorsHeaders(headers("chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")).get(
        "access-control-allow-origin",
      ),
    ).toBeNull();

    process.env.ULIXDESK_EXTENSION_IDS = "";
    expect(extensionCorsHeaders(headers(origin)).get("access-control-allow-origin")).toBeNull();
  });
});
