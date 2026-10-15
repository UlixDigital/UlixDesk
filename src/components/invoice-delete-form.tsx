"use client";

import { useActionState } from "react";
import { deleteDraftAction, type InvoiceFormState } from "@/app/invoices/actions";
import { invoiceCopy } from "@/lib/invoice-copy";
import { ui } from "@/lib/ui";

const idle: InvoiceFormState = { error: null, notice: null };

export function InvoiceDeleteForm({ invoiceId }: { invoiceId: string }) {
  const [state, action, pending] = useActionState(deleteDraftAction, idle);
  return (
    <form action={action} className="rounded-xl border border-rose-200 bg-white p-4">
      <input type="hidden" name="id" value={invoiceId} />
      <p className="text-sm text-slate-700">{invoiceCopy.deleteBody}</p>
      {state.error ? (
        <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className={`${ui.dangerButton} mt-3`} disabled={pending}>
        {pending ? "Deleting…" : invoiceCopy.delete}
      </button>
    </form>
  );
}
