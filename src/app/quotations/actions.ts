"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { gateManager } from "@/lib/auth";
import { authCopy } from "@/lib/auth-copy";
import { quotationCopy } from "@/lib/quotation-copy";
import { revokeQuotationLink, rotateQuotationLink } from "@/lib/quotation-link";
import { sendQuotation } from "@/lib/quotation-send";
import { parseQuotationFromForm } from "@/lib/quotation-form";
import {
  convertQuotationToInvoice,
  createQuotation,
  decideQuotation,
  duplicateQuotation,
  getQuotation,
  markQuotationSent,
  saveQuotationDraft,
} from "@/lib/quotations";

export type QuotationFormState = {
  error: string | null;
  notice: string | null;
  unconfigured?: boolean;
};

function gateError(error: string) {
  return error === authCopy.manageDenied ? quotationCopy.denied : error;
}

export async function createQuotationAction(
  _previous: QuotationFormState,
  formData: FormData,
): Promise<QuotationFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) return { error: quotationCopy.clientRequired, notice: null };
  const created = await createQuotation({ actor: gate.user, clientId });
  if (!created.ok) return { error: created.error, notice: null };
  revalidatePath("/quotations");
  redirect(`/quotations/${created.id}`);
}

export async function saveQuotationAction(
  _previous: QuotationFormState,
  formData: FormData,
): Promise<QuotationFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const quotation = await getQuotation(gate.user.role, id);
  if (!quotation) return { error: quotationCopy.notFound, notice: null };
  const parsed = parseQuotationFromForm(formData, quotation.currency);
  if (!parsed.ok) return { error: parsed.error, notice: null };
  const saved = await saveQuotationDraft({ actor: gate.user, id, draft: parsed.data });
  if (!saved.ok) return { error: saved.error, notice: null };
  const intent = String(formData.get("intent") ?? "save");
  if (intent === "send") {
    const sent = await markQuotationSent({ actor: gate.user, id });
    if (!sent.ok) return { error: sent.error, notice: null };
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${id}`);
    redirect(`/quotations/${id}?notice=sent`);
  }
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { error: null, notice: quotationCopy.saved };
}

export async function decideQuotationAction(
  _previous: QuotationFormState,
  formData: FormData,
): Promise<QuotationFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "accepted" && decision !== "declined") return { error: quotationCopy.notOpen, notice: null };
  const result = await decideQuotation({ actor: gate.user, id, decision });
  if (!result.ok) return { error: result.error, notice: null };
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  redirect(`/quotations/${id}?notice=${decision}`);
}

export async function duplicateQuotationAction(
  _previous: QuotationFormState,
  formData: FormData,
): Promise<QuotationFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const result = await duplicateQuotation({ actor: gate.user, id });
  if (!result.ok) return { error: result.error, notice: null };
  revalidatePath("/quotations");
  redirect(`/quotations/${result.id}?notice=duplicated`);
}

export async function convertQuotationAction(
  _previous: QuotationFormState,
  formData: FormData,
): Promise<QuotationFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const result = await convertQuotationToInvoice({ actor: gate.user, id });
  if (!result.ok) return { error: result.error, notice: null };
  revalidatePath("/quotations");
  revalidatePath("/invoices");
  revalidatePath(`/quotations/${id}`);
  redirect(`/invoices/${result.invoiceId}`);
}

export async function rotateQuotationLinkAction(
  _previous: QuotationFormState,
  formData: FormData,
): Promise<QuotationFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const result = await rotateQuotationLink({ actor: gate.user, id });
  if (!result.ok) return { error: result.error, notice: null };
  revalidatePath(`/quotations/${id}`);
  return { error: null, notice: quotationCopy.clientLinkActive };
}

export async function revokeQuotationLinkAction(
  _previous: QuotationFormState,
  formData: FormData,
): Promise<QuotationFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const result = await revokeQuotationLink({ actor: gate.user, id });
  if (!result.ok) return { error: result.error, notice: null };
  revalidatePath(`/quotations/${id}`);
  return { error: null, notice: result.revoked ? quotationCopy.clientLinkRevoked : quotationCopy.clientLinkNone };
}

export async function sendQuotationAction(
  _previous: QuotationFormState,
  formData: FormData,
): Promise<QuotationFormState> {
  const gate = await gateManager();
  if (!gate.ok) return { error: gateError(gate.error), notice: null };
  const id = String(formData.get("id") ?? "");
  const result = await sendQuotation({
    actor: gate.user,
    id,
    to: String(formData.get("to") ?? ""),
    cc: String(formData.get("cc") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
    confirmSend: formData.get("confirmSend") === "on",
  });
  if (!result.ok && "unconfigured" in result && result.unconfigured) {
    return { error: result.error, notice: null, unconfigured: true };
  }
  if (!result.ok) return { error: result.error, notice: null };
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  redirect(`/quotations/${id}?notice=emailed`);
}
