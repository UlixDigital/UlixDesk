import { describe, expect, it } from "vitest";
import { workspaceTimeZoneOptions } from "@/lib/workspace-time";

describe("workspace timezone options", () => {
  it("leaves a rejected timezone out of the list", () => {
    const options = workspaceTimeZoneOptions("Mars/Olympus");
    expect(options).not.toContain("Mars/Olympus");
    expect(options).toContain("Asia/Colombo");
    expect(options.filter((zone) => zone === "Asia/Colombo")).toHaveLength(1);
  });
});
