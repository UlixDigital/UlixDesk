"use server";

import { revalidatePath } from "next/cache";
import { authCopy } from "@/lib/auth-copy";
import { gateManager } from "@/lib/auth";
import {
  saveClientRate,
  saveMemberRate,
  saveProjectRate,
  setWorkspaceCurrency,
} from "@/lib/bill-rates";
import { rateCodes, rateCopy, type RateCode } from "@/lib/rate-copy";

export type RateFormState = {
  error: string | null;
  code: RateCode | null;
  notice: string | null;
  values: { amount: string; effectiveFrom: string; userId: string };
};

export type CurrencyFormState = {
  error: string | null;
  code: RateCode | null;
  notice: string | null;
  currency: string;
};

function denied(values: RateFormState["values"]): RateFormState {
  return {
    error: authCopy.manageDenied,
    code: rateCodes.RATE_FORBIDDEN,
    notice: null,
    values,
  };
}

function readRateFields(formData: FormData) {
  return {
    amount: String(formData.get("amount") ?? ""),
    effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
    userId: String(formData.get("userId") ?? ""),
  };
}

export async function saveClientRateAction(
  _previous: RateFormState,
  formData: FormData,
): Promise<RateFormState> {
  const values = readRateFields(formData);
  const gate = await gateManager();
  if (!gate.ok) return denied(values);
  try {
    const saved = await saveClientRate({
      clientId: String(formData.get("clientId") ?? ""),
      amountRaw: values.amount,
      effectiveFrom: values.effectiveFrom,
      createdById: gate.user.id,
    });
    if (!saved.ok) return { error: saved.error, code: saved.code, notice: null, values };
  } catch (error) {
    console.error("Failed to save a client bill rate", error);
    return { error: rateCopy.saveFailed, code: rateCodes.RATE_SAVE_FAILED, notice: null, values };
  }
  revalidatePath("/clients");
  revalidatePath("/timesheets");
  return {
    error: null,
    code: null,
    notice: rateCopy.rateSaved,
    values: { amount: "", effectiveFrom: values.effectiveFrom, userId: "" },
  };
}

export async function saveProjectRateAction(
  _previous: RateFormState,
  formData: FormData,
): Promise<RateFormState> {
  const values = readRateFields(formData);
  const gate = await gateManager();
  if (!gate.ok) return denied(values);
  try {
    const saved = await saveProjectRate({
      projectId: String(formData.get("projectId") ?? ""),
      amountRaw: values.amount,
      effectiveFrom: values.effectiveFrom,
      createdById: gate.user.id,
    });
    if (!saved.ok) return { error: saved.error, code: saved.code, notice: null, values };
  } catch (error) {
    console.error("Failed to save a project bill rate", error);
    return { error: rateCopy.saveFailed, code: rateCodes.RATE_SAVE_FAILED, notice: null, values };
  }
  revalidatePath("/projects");
  revalidatePath("/timesheets");
  return {
    error: null,
    code: null,
    notice: rateCopy.rateSaved,
    values: { amount: "", effectiveFrom: values.effectiveFrom, userId: "" },
  };
}

export async function saveMemberRateAction(
  _previous: RateFormState,
  formData: FormData,
): Promise<RateFormState> {
  const values = readRateFields(formData);
  const gate = await gateManager();
  if (!gate.ok) return denied(values);
  try {
    const saved = await saveMemberRate({
      clientId: String(formData.get("clientId") ?? ""),
      userId: values.userId,
      amountRaw: values.amount,
      effectiveFrom: values.effectiveFrom,
      createdById: gate.user.id,
    });
    if (!saved.ok) return { error: saved.error, code: saved.code, notice: null, values };
  } catch (error) {
    console.error("Failed to save a member bill rate", error);
    return { error: rateCopy.saveFailed, code: rateCodes.RATE_SAVE_FAILED, notice: null, values };
  }
  revalidatePath("/clients");
  revalidatePath("/timesheets");
  return {
    error: null,
    code: null,
    notice: rateCopy.rateSaved,
    values: { amount: "", effectiveFrom: values.effectiveFrom, userId: "" },
  };
}

export async function saveWorkspaceCurrencyAction(
  previous: CurrencyFormState,
  formData: FormData,
): Promise<CurrencyFormState> {
  const currency = String(formData.get("currency") ?? "");
  const gate = await gateManager();
  if (!gate.ok) {
    return {
      error: authCopy.manageDenied,
      code: rateCodes.RATE_FORBIDDEN,
      notice: null,
      currency: previous.currency,
    };
  }
  try {
    const saved = await setWorkspaceCurrency(currency);
    if (!saved.ok) {
      return { error: saved.error, code: saved.code, notice: null, currency };
    }
  } catch (error) {
    console.error("Failed to save the workspace currency", error);
    return {
      error: rateCopy.currencySaveFailed,
      code: rateCodes.RATE_SAVE_FAILED,
      notice: null,
      currency,
    };
  }
  revalidatePath("/settings");
  revalidatePath("/clients/new");
  return { error: null, code: null, notice: rateCopy.workspaceSaved, currency };
}
