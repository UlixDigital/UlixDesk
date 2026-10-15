import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";
import { ui } from "@/lib/ui";

describe("cn", () => {
  it("lets the invalid border replace the default border", () => {
    const classes = cn(ui.input, ui.inputError);
    expect(classes).toContain("border-rose-400");
    expect(classes).not.toContain("border-slate-300");
    expect(classes).toContain("focus:border-rose-600");
    expect(classes).not.toContain("focus:border-accent");
    expect(classes).toContain("focus:ring-rose-600/20");
    expect(classes).not.toContain("focus:ring-accent/30");
    expect(classes).toContain("border");
  });
});
