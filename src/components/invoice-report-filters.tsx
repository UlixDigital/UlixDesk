"use client";

import { invoiceCopy } from "@/lib/invoice-copy";
import { invoiceReportCopy } from "@/lib/invoice-report-copy";
import { reportCopy } from "@/lib/report-copy";
import type { ReportPreset } from "@/lib/report-query";
import { ui } from "@/lib/ui";

type ClientOption = { id: string; name: string; archived: boolean };

export function InvoiceReportFilters({
  action,
  preset,
  from,
  to,
  clientId,
  status,
  clients,
  filtered,
}: {
  action: string;
  preset: ReportPreset;
  from: string;
  to: string;
  clientId: string;
  status?: "all" | "open" | "paid";
  clients: ClientOption[];
  filtered: boolean;
}) {
  return (
    <form
      action={action}
      method="get"
      aria-label={reportCopy.filtersLabel}
      className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      onChange={(event) => {
        const id = (event.target as HTMLElement).id;
        if (id.endsWith("-from") || id.endsWith("-to")) {
          const presetField = event.currentTarget.elements.namedItem("preset");
          if (presetField instanceof HTMLSelectElement) presetField.value = "custom";
        }
        if (id.startsWith("invoice-report-")) event.currentTarget.requestSubmit();
      }}
    >
      <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-report-preset">
        {reportCopy.presetLabel}
        <select id="invoice-report-preset" name="preset" defaultValue={preset} className={`${ui.input} mt-1.5`}>
          <option value="today">{reportCopy.presetToday}</option>
          <option value="this-week">{reportCopy.presetThisWeek}</option>
          <option value="last-week">{reportCopy.presetLastWeek}</option>
          <option value="this-month">{reportCopy.presetThisMonth}</option>
          <option value="last-month">{reportCopy.presetLastMonth}</option>
          <option value="custom">{reportCopy.presetCustom}</option>
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-report-from">
        {reportCopy.fromLabel}
        <input id="invoice-report-from" name="from" type="date" required defaultValue={from} className={`${ui.input} mt-1.5`} />
      </label>
      <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-report-to">
        {action.endsWith("invoice-aging") ? invoiceReportCopy.asOfLabel : reportCopy.toLabel}
        <input id="invoice-report-to" name="to" type="date" required defaultValue={to} className={`${ui.input} mt-1.5`} />
      </label>
      <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-report-client">
        {invoiceCopy.client}
        <select id="invoice-report-client" name="client" key={clientId} defaultValue={clientId} className={`${ui.input} mt-1.5`}>
          <option value="">{invoiceCopy.allClients}</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
              {client.archived ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </label>
      {status ? (
        <label className="block text-sm font-medium text-slate-800" htmlFor="invoice-report-status">
          {invoiceCopy.status}
          <select id="invoice-report-status" name="status" defaultValue={status} className={`${ui.input} mt-1.5`}>
            <option value="all">{invoiceReportCopy.statusAll}</option>
            <option value="open">{invoiceReportCopy.statusOpen}</option>
            <option value="paid">{invoiceReportCopy.statusPaid}</option>
          </select>
        </label>
      ) : null}
      <div className="flex items-end gap-2">
        <button type="submit" className={ui.secondaryButton}>
          {invoiceCopy.applyFilters}
        </button>
        {filtered ? (
          <a href={action} className={ui.secondaryButton}>
            {reportCopy.clearFilters}
          </a>
        ) : null}
      </div>
    </form>
  );
}
