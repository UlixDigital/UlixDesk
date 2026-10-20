"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createBlankInvoiceAction, createInvoiceAction, type InvoiceFormState } from "@/app/invoices/actions";
import { invoiceCopy } from "@/lib/invoice-copy";
import { ui } from "@/lib/ui";

const idle: InvoiceFormState = { error: null, notice: null };

export function InvoiceCreateForm({
  clients,
  periodStart,
  periodEnd,
  blank = false,
}: {
  clients: Array<{ id: string; name: string; currency: string }>;
  periodStart: string;
  periodEnd: string;
  blank?: boolean;
}) {
  if (blank) return <BlankInvoiceForm clients={clients} />;
  return <TimeInvoiceForm clients={clients} periodStart={periodStart} periodEnd={periodEnd} />;
}

function BlankInvoiceForm({ clients }: { clients: Array<{ id: string; name: string; currency: string }> }) {
  const [state, action, pending] = useActionState(createBlankInvoiceAction, idle);
  return (
    <form id="invoice-blank" action={action} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      {state.error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      <label className="block text-sm font-medium text-slate-800" htmlFor="blank-invoice-client">
        {invoiceCopy.client}
        <select id="blank-invoice-client" name="clientId" className={`${ui.input} mt-1.5`} required defaultValue="">
          <option value="" disabled>
            {invoiceCopy.clientRequired.replace(/\.$/, "")}
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name} ({client.currency})
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={ui.primaryButton} disabled={pending || clients.length === 0}>
          {pending ? invoiceCopy.creating : invoiceCopy.blankCreate}
        </button>
        <Link href="/invoices/new" className="text-sm text-slate-600 hover:text-accent">
          {invoiceCopy.timeLink}
        </Link>
      </div>
    </form>
  );
}

function TimeInvoiceForm({
  clients,
  periodStart,
  periodEnd,
}: {
  clients: Array<{ id: string; name: string; currency: string }>;
  periodStart: string;
  periodEnd: string;
}) {
  const [state, action, pending] = useActionState(createInvoiceAction, idle);
  return (
    <form action={action} className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      {state.error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-client">
        {invoiceCopy.client}
        <select id="invoice-client" name="clientId" className={`${ui.input} mt-1.5`} required defaultValue="">
          <option value="" disabled>
            {invoiceCopy.clientRequired.replace(/\.$/, "")}
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name} ({client.currency})
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-period-start">
          Start
          <input id="invoice-period-start" name="periodStart" type="date" defaultValue={periodStart} className={`${ui.input} mt-1.5`} required />
        </label>
        <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-period-end">
          End
          <input id="invoice-period-end" name="periodEnd" type="date" defaultValue={periodEnd} className={`${ui.input} mt-1.5`} required />
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-grouping">
        {invoiceCopy.grouping}
        <select id="invoice-grouping" name="grouping" defaultValue="period" className={`${ui.input} mt-1.5`}>
          <option value="period">{invoiceCopy.groupingPeriod}</option>
          <option value="project">{invoiceCopy.groupingProject}</option>
          <option value="member">{invoiceCopy.groupingMember}</option>
          <option value="day">{invoiceCopy.groupingDay}</option>
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={ui.primaryButton} disabled={pending || clients.length === 0}>
          {pending ? invoiceCopy.creating : invoiceCopy.create}
        </button>
        <Link href="/invoices/new?blank=1" className="text-sm text-slate-600 hover:text-accent">
          {invoiceCopy.blankLink}
        </Link>
      </div>
    </form>
  );
}
