/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { SetPasswordForm } from "@/app/set-password/set-password-form";

vi.mock("@/app/set-password/actions", () => ({
  setPasswordAction: vi.fn(async () => ({ error: "Those passwords don't match." })),
}));

let root: Root | null = null;

describe("set-password form", () => {
  it("clears a stale error when the password fields change", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(SetPasswordForm, { token: "token" }));
    });

    const password = document.getElementById("password") as HTMLInputElement;
    const confirm = document.getElementById("confirm") as HTMLInputElement;
    await act(async () => {
      setInput(password, "new-password-10");
      setInput(confirm, "different-10");
    });
    const form = password.form!;
    await act(async () => {
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(document.body.textContent).toContain("Those passwords don't match.");

    await act(async () => {
      setInput(confirm, "new-password-10");
    });
    expect(document.body.textContent).not.toContain("Those passwords don't match.");

    await act(async () => {
      root?.unmount();
    });
  });
});

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
