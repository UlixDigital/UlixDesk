import { describe, expect, it } from "vitest";
import { signSessionCookie as signWithNode } from "../../scripts/session-cookie.mjs";
import { signSessionCookie } from "@/lib/session-cookie";

describe("node session cookie", () => {
  it("matches the Web Crypto signature the middleware checks", async () => {
    const secret = "test-session-secret-at-least-32-characters";
    const token = "local-session-token_value";
    expect(signWithNode(token, secret)).toBe(await signSessionCookie(token, secret));
  });
});
