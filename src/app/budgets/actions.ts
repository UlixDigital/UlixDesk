"use server";

import { revalidatePath } from "next/cache";
import { budgetCodes, budgetCopy, type BudgetCode } from "@/lib/budget-copy";
import { deleteBudget, saveBudget, type BudgetFormValues } from "@/lib/budgets";
import { gateManager } from "@/lib/auth";

export type BudgetActionState = {
  error: string | null;
  code: BudgetCode | null;
  notice: string | null;
  values: BudgetFormValues;
};

export type BudgetRemoveState = {
  error: string | null;
  notice: string | null;
};

function readValues(formData: FormData): BudgetFormValues {
  return {
    basis: String(formData.get("basis") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    recurrence: String(formData.get("recurrence") ?? ""),
    startsOn: String(formData.get("startsOn") ?? ""),
    billableOnly: formData.get("billableOnly") === "on",
    alertPercent: String(formData.get("alertPercent") ?? ""),
    hardStop: formData.get("hardStop") === "on",
  };
}

function scopeOf(formData: FormData): "project" | "client" {
  return formData.get("scope") === "client" ? "client" : "project";
}

function revalidateBudget(scope: "project" | "client", projectId: string, clientId: string) {
  if (scope === "project" && projectId) revalidatePath(`/projects/${projectId}/edit`);
  if (scope === "client" && clientId) revalidatePath(`/clients/${clientId}/edit`);
  revalidatePath("/projects");
  revalidatePath("/reports/budgets");
}

export async function saveBudgetAction(
  _previous: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  const values = readValues(formData);
  const gate = await gateManager();
  if (!gate.ok) {
    return { error: budgetCopy.forbidden, code: budgetCodes.BUDGET_FORBIDDEN, notice: null, values };
  }
  const scope = scopeOf(formData);
  const projectId = String(formData.get("projectId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  try {
    const saved = await saveBudget({
      actorRole: gate.user.role,
      actorId: gate.user.id,
      scope,
      projectId,
      clientId,
      form: values,
    });
    if (!saved.ok) return { error: saved.error, code: saved.code, notice: null, values };
  } catch (error) {
    console.error("Failed to save a budget", error);
    return { error: budgetCopy.subjectMissing, code: budgetCodes.BUDGET_NOT_FOUND, notice: null, values };
  }
  revalidateBudget(scope, projectId, clientId);
  return { error: null, code: null, notice: budgetCopy.saved, values };
}

export async function deleteBudgetAction(
  _previous: BudgetRemoveState,
  formData: FormData,
): Promise<BudgetRemoveState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: budgetCopy.forbidden, notice: null };
  const scope = scopeOf(formData);
  const projectId = String(formData.get("projectId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const removed = await deleteBudget({ actorRole: gate.user.role, scope, projectId, clientId });
  if (!removed.ok) return { error: removed.error, notice: null };
  revalidateBudget(scope, projectId, clientId);
  return { error: null, notice: budgetCopy.removed };
}
