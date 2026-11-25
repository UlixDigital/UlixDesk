"use client";

import { useActionState } from "react";
import { createQuotationAction, type QuotationFormState } from "@/app/quotations/actions";
import { quotationCopy } from "@/lib/quotation-copy";
import { ui } from "@/lib/ui";

const idle: QuotationFormState = { error: null, notice: null };

export function QuotationCreateForm({
  clients,
}: {
  clients: Array<{ id: string; name: string; currency: string }>;
}) {
  const [state, action, pending] = useActionState(createQuotationAction, idle);
  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {state.error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      <label className="block text-sm font-medium text-slate-800" htmlFor="quotation-client">
        {quotationCopy.client}
        <select id="quotation-client" name="clientId" className={`${ui.input} mt-1.5`} required defaultValue="">
          <option value="" disabled>
            {quotationCopy.clientRequired}
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name} ({client.currency})
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={ui.primaryButton} disabled={pending}>
        {pending ? quotationCopy.creating : quotationCopy.create}
      </button>
    </form>
  );
}
