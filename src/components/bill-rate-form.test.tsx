/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { RateFormState } from "@/app/rates/actions";
import { BillRateForm } from "@/components/bill-rate-form";
import { rateCodes, rateCopy } from "@/lib/rate-copy";
import { ui } from "@/lib/ui";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const idle: RateFormState = {
  error: null,
  code: null,
  notice: null,
  values: { amount: "", effectiveFrom: "2026-10-15", userId: "" },
};

describe("bill rate field errors", () => {
  it("marks the rate input invalid and points at the error", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    const action = async (): Promise<RateFormState> => ({
      error: rateCopy.amountInvalid,
      code: rateCodes.RATE_INVALID,
      notice: null,
      values: { amount: "nope", effectiveFrom: "2026-10-15", userId: "" },
    });

    await act(async () => {
      root.render(
        createElement(BillRateForm, {
          action,
          today: "2026-10-15",
          currency: "USD",
          timeZone: "Asia/Colombo",
          clientId: "client-1",
        }),
      );
    });

    const form = container.querySelector("form")!;
    await act(async () => {
      form.requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    const amount = document.getElementById("client-rate-amount") as HTMLInputElement;
    const error = container.querySelector("[role='alert']")!;
    expect(amount.getAttribute("aria-invalid")).toBe("true");
    expect(amount.getAttribute("aria-describedby")).toContain(error.id);
    expect(amount.className).toContain(ui.inputError);
    expect(error.textContent).toBe(rateCopy.amountInvalid);
    expect(document.getElementById("client-rate-date")?.getAttribute("aria-invalid")).toBeNull();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});