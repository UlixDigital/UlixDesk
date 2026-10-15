"use client";

import { useActionState } from "react";
import { saveInvoiceSettingsAction, type InvoiceFormState } from "@/app/invoices/actions";
import { invoiceCopy } from "@/lib/invoice-copy";
import { ui } from "@/lib/ui";

const idle: InvoiceFormState = { error: null, notice: null };

export function InvoiceSettingsForm({
  companyName,
  companyAddress,
  invoicePrefix,
  nextInvoiceNumber,
  invoiceNetTermsDays,
  invoiceNotes,
  invoiceBankDetails,
  invoiceTaxEnabled,
  invoiceTaxLabel,
  invoiceTaxRate,
}: {
  companyName: string;
  companyAddress: string;
  invoicePrefix: string;
  nextInvoiceNumber: string;
  invoiceNetTermsDays: string;
  invoiceNotes: string;
  invoiceBankDetails: string;
  invoiceTaxEnabled: boolean;
  invoiceTaxLabel: string;
  invoiceTaxRate: string;
}) {
  const [state, action, pending] = useActionState(saveInvoiceSettingsAction, idle);
  return (
    <form action={action} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      {state.error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {state.notice}
        </p>
      ) : null}
      <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-company-name">
        {invoiceCopy.companyName}
        <input id="invoice-company-name" name="companyName" defaultValue={companyName} className={`${ui.input} mt-1.5`} required />
      </label>
      <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-company-address">
        {invoiceCopy.companyAddress}
        <textarea
          id="invoice-company-address"
          name="companyAddress"
          defaultValue={companyAddress}
          rows={3}
          className={`${ui.input} mt-1.5`}
          required
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-prefix">
          {invoiceCopy.prefix}
          <input id="invoice-prefix" name="invoicePrefix" defaultValue={invoicePrefix} className={`${ui.input} mt-1.5`} required />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-next-number">
          {invoiceCopy.nextNumber}
          <input
            id="invoice-next-number"
            name="nextInvoiceNumber"
            defaultValue={nextInvoiceNumber}
            inputMode="numeric"
            className={`${ui.input} mt-1.5`}
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-net-terms">
          {invoiceCopy.netTerms}
          <input
            id="invoice-net-terms"
            name="invoiceNetTermsDays"
            defaultValue={invoiceNetTermsDays}
            inputMode="numeric"
            className={`${ui.input} mt-1.5`}
            required
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">{invoiceCopy.nextNumberHint}</p>
      <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-notes">
        {invoiceCopy.defaultNotes}
        <textarea id="invoice-notes" name="invoiceNotes" defaultValue={invoiceNotes} rows={4} className={`${ui.input} mt-1.5`} />
      </label>
      <p className="text-xs text-slate-500">{invoiceCopy.hashLinesKept}</p>
      <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-bank-details">
        {invoiceCopy.defaultBank}
        <textarea
          id="invoice-bank-details"
          name="invoiceBankDetails"
          defaultValue={invoiceBankDetails}
          rows={6}
          className={`${ui.input} mt-1.5`}
        />
      </label>
      <p className="text-xs text-slate-500">{invoiceCopy.bankSeedHint}</p>
      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-800">{invoiceCopy.defaultTax}</legend>
        <label className="flex items-center gap-2 text-sm text-slate-800" htmlFor="invoice-tax-enabled">
          <input id="invoice-tax-enabled" name="invoiceTaxEnabled" type="checkbox" defaultChecked={invoiceTaxEnabled} />
          {invoiceCopy.applyTax}
        </label>
        <p className="text-xs text-slate-500">{invoiceCopy.taxOff}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-tax-label">
            {invoiceCopy.taxLabel}
            <input id="invoice-tax-label" name="invoiceTaxLabel" defaultValue={invoiceTaxLabel} className={`${ui.input} mt-1.5`} />
          </label>
          <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-tax-rate">
            {invoiceCopy.taxRate}
            <input id="invoice-tax-rate" name="invoiceTaxRate" defaultValue={invoiceTaxRate} className={`${ui.input} mt-1.5`} />
          </label>
        </div>
      </fieldset>
      <button type="submit" className={ui.primaryButton} disabled={pending}>
        {pending ? invoiceCopy.saving : "Save settings"}
      </button>
    </form>
  );
}
