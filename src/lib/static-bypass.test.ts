import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import nextConfig from "../../next.config";
import { middleware, config } from "@/middleware";
import { sessionGate } from "@/lib/access-decision";
import { isStaticBypass, PUBLIC_ASSET_PATHS } from "@/lib/static-bypass";
import { SESSION_COOKIE, signSessionCookie } from "@/lib/session-cookie";

describe("static bypass", () => {
  it("allows next static assets and the known public files only", () => {
    expect(isStaticBypass("/_next/static/chunks/app.js")).toBe(true);
    expect(isStaticBypass("/_next/image")).toBe(false);
    expect(isStaticBypass("/_next/image/")).toBe(false);
    expect(isStaticBypass("/_next/image/extra")).toBe(false);
    for (const path of PUBLIC_ASSET_PATHS) {
      expect(isStaticBypass(path)).toBe(true);
    }
    expect(isStaticBypass("/future-route.svg")).toBe(false);
    expect(isStaticBypass("/reports/chart.png")).toBe(false);
    expect(isStaticBypass("/invoices/acme.webp")).toBe(false);
    expect(isStaticBypass("/clients")).toBe(false);
  });

  it("does not skip middleware for the image optimizer or every image extension", () => {
    const matcher = config.matcher.join(" ");
    expect(matcher).not.toContain("svg|png");
    expect(matcher).not.toContain("webp");
    expect(matcher).not.toContain("_next/image");
    expect(matcher).toContain("_next/static");
    expect(matcher).toContain("favicon\\.ico");
    expect(matcher).toContain("icon\\.svg");
    expect(matcher).toContain("ulix-logo\\.svg");
    expect(middlewareRunsFor(matcher, "/_next/image")).toBe(true);
    expect(middlewareRunsFor(matcher, "/_next/static/chunks/app.js")).toBe(false);
    expect(middlewareRunsFor(matcher, "/ulix-logo.svg")).toBe(false);
  });

  it("keeps SVG optimization disabled", () => {
    expect(nextConfig.images?.dangerouslyAllowSVG ?? false).toBe(false);
    expect(nextConfig.images?.unoptimized).not.toBe(true);
  });

  it("denies an unauthenticated image optimizer request", async () => {
    expect(
      sessionGate({ pathname: "/_next/image", hasValidSession: false, isTokenApi: false }),
    ).toEqual({ type: "redirect", to: "/login?next=%2F_next%2Fimage" });

    const response = await middleware(optimizerRequest());
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/_next/image");
    expect(response.headers.get("content-type") ?? "").not.toContain("image/");
  });

  it("lets a signed-in request continue to the image optimizer", async () => {
    const secret = process.env.ULIXDESK_SESSION_SECRET ?? "";
    const cookie = await signSessionCookie("optimizer-test-token", secret);
    const response = await middleware(optimizerRequest(cookie));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

function optimizerRequest(cookie?: string) {
  const headers = new Headers({ host: "127.0.0.1:3000" });
  if (cookie) headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
  return new NextRequest("http://127.0.0.1:3000/_next/image?url=%2Fulix-logo.svg&w=48&q=75", {
    headers,
  });
}

/** Next's matcher is a negative lookahead after the leading slash. */
function middlewareRunsFor(matcher: string, pathname: string) {
  const match = matcher.match(/^\/\(\(\?!([^)]+)\)\.\*\)$/);
  if (!match?.[1]) return false;
  const skipped = match[1].split("|").map((part) => part.replace(/\\/g, ""));
  const rest = pathname.replace(/^\//, "");
  return !skipped.some((prefix) => rest === prefix || rest.startsWith(`${prefix}/`) || rest.startsWith(prefix));
}
