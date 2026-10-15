import { describe, expect, it } from "vitest";
import { hostAccessRequest } from "./host-permission";

describe("host access request", () => {
  it("asks only for the chosen origin", () => {
    expect(hostAccessRequest("https://desk.ulixdigital.com/*")).toEqual({
      origins: ["https://desk.ulixdigital.com/*"],
    });
    expect(hostAccessRequest("http://127.0.0.1:3000/*").origins).toEqual([
      "http://127.0.0.1:3000/*",
    ]);
  });
});
