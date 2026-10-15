"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { gateManager } from "@/lib/auth";
import { authCopy } from "@/lib/auth-copy";
import { invoiceCopy } from "@/lib/invoice-copy";
import { isInvoiceGrouping, parseCreateInvoice } from "@/lib/invoice-form";
import { revokeClientLink, rotateClientLink } from "@/lib/invoice-link";
import { sendInvoice } from "@/lib/invoice-send";
import { saveInvoiceSettings } from "@/lib/invoice-settings";
import { reopenInvoice, voidInvoice } from "@/lib/invoice-status";
import { createInvoice, deleteDraft, getInvoice, parseDraftFromForm, refreshDraftFromTime, saveDraft } from "@/lib/invoices";

export type InvoiceFormState = {
  error: string | null;
  notice: string | null;
  confirmDiffs?: string[] | null;
};

function gateError(error: string) {
  return error === authCopy.manageDenied ? invoiceCopy.denied : error;
}

export async function saveInvoiceSettingsAction(
  _previous: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const saved = await saveInvoiceSettings(gate.user.role, {
    companyName: String(formData.get("companyName") ?? ""),
    companyAddress: String(formData.get("companyAddress") ?? ""),
    invoicePrefix: String(formData.get("invoicePrefix") ?? ""),
    nextInvoiceNumber: String(formData.get("nextInvoiceNumber") ?? ""),
    invoiceNetTermsDays: String(formData.get("invoiceNetTermsDays") ?? ""),
    invoiceNotes: String(formData.get("invoiceNotes") ?? ""),
    invoiceBankDetails: String(formData.get("invoiceBankDetails") ?? ""),
    invoiceTaxEnabled: formData.get("invoiceTaxEnabled") === "on",
    invoiceTaxLabel: String(formData.get("invoiceTaxLabel") ?? ""),
    invoiceTaxRate: String(formData.get("invoiceTaxRate") ?? ""),
  });
  if (!saved.ok) return { error: saved.error, notice: null };
  revalidatePath("/invoices/settings");
  return { error: null, notice: invoiceCopy.settingsSaved };
}

export async function createInvoiceAction(
  _previous: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const parsed = parseCreateInvoice({
    clientId: String(formData.get("clientId") ?? ""),
    periodStart: String(formData.get("periodStart") ?? ""),
    periodEnd: String(formData.get("periodEnd") ?? ""),
    grouping: String(formData.get("grouping") ?? ""),
  });
  if (!parsed.ok) return { error: parsed.error, notice: null };
  if (!isInvoiceGrouping(parsed.data.grouping)) return { error: invoiceCopy.groupingInvalid, notice: null };
  const created = await createInvoice({ actor: gate.user, ...parsed.data });
  if (!created.ok) return { error: created.error, notice: null };
  revalidatePath("/invoices");
  redirect(`/invoices/${created.id}`);
}

export async function saveDraftAction(
  _previous: InvoiceFormState,
  formData: FormData,
): Promise<InvoiceFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const invoice = await getInvoice(gate.user.role, id);
  if (!invoice) return { error: invoiceCopy.notFound, notice: null };
  const parsed = parseDraftFromForm(formData, invoice.currency);
  if (!parsed.ok) return { error: parsed.error, notice: null };
  const intent = String(formData.get("intent") ?? "save");
  if (intent === "refresh") {
    const refreshed = await refreshDraftFromTime({ actor: gate.user, id, draft: parsed.data });
    if (!refreshed.ok) return { error: refreshed.error, notice: null };
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    redirect(`/invoices/${id}`);
  }
  const issue = intent === "issue" || intent === "issue-confirm";
  const saved = await saveDraft({
    actor: gate.user,
    id,
    draft: parsed.data,
    issue,
    confirm: intent === "issue-confirm",
  });
  if (!saved.ok && "confirm" in saved && saved.confirm) {
    return { error: null, notice: null, confirmDiffs: saved.diffs };
  }
  if (!saved.ok) return { error: saved.error, notice: null };
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  if (issue) redirect(`/invoices/${id}`);
  return { error: null, notice: invoiceCopy.saved };
}

export async function voidInvoiceAction(_previous: InvoiceFormState, formData: FormData): Promise<InvoiceFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const result = await voidInvoice({ actor: gate.user, id, reason: String(formData.get("reason") ?? "") });
  if (!result.ok) return { error: result.error, notice: null };
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}?notice=voided`);
}

export async function reopenInvoiceAction(_previous: InvoiceFormState, formData: FormData): Promise<InvoiceFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const result = await reopenInvoice({ actor: gate.user, id, reason: String(formData.get("reason") ?? "") });
  if (!result.ok) return { error: result.error, notice: null };
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}?notice=reopened`);
}

export async function rotateClientLinkAction(_previous: InvoiceFormState, formData: FormData): Promise<InvoiceFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const result = await rotateClientLink({ actor: gate.user, id });
  if (!result.ok) return { error: result.error, notice: null };
  revalidatePath(`/invoices/${id}`);
  return { error: null, notice: invoiceCopy.clientLinkActive };
}

export async function revokeClientLinkAction(_previous: InvoiceFormState, formData: FormData): Promise<InvoiceFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const result = await revokeClientLink({ actor: gate.user, id });
  if (!result.ok) return { error: result.error, notice: null };
  revalidatePath(`/invoices/${id}`);
  return { error: null, notice: result.revoked ? invoiceCopy.clientLinkRevoked : invoiceCopy.clientLinkNone };
}

export type SendInvoiceState = {
  error: string | null;
  notice: string | null;
  confirmDiffs?: string[] | null;
  unconfigured?: boolean;
};

export async function sendInvoiceAction(_previous: SendInvoiceState, formData: FormData): Promise<SendInvoiceState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const result = await sendInvoice({
    actor: gate.user,
    id,
    to: String(formData.get("to") ?? ""),
    cc: String(formData.get("cc") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
    confirmIssue: formData.get("confirmIssue") === "yes",
    confirmTime: formData.get("confirmTime") === "yes",
  });
  if (!result.ok && "unconfigured" in result && result.unconfigured) {
    return { error: result.error, notice: null, unconfigured: true };
  }
  if (!result.ok && "confirm" in result && result.confirm) {
    return { error: null, notice: null, confirmDiffs: result.diffs };
  }
  if (!result.ok) return { error: result.error, notice: null };
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}?notice=sent`);
}

export async function deleteDraftAction(_previous: InvoiceFormState, formData: FormData): Promise<InvoiceFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const removed = await deleteDraft({ actor: gate.user, id });
  if (!removed.ok) return { error: removed.error, notice: null };
  revalidatePath("/invoices");
  redirect("/invoices");
}
