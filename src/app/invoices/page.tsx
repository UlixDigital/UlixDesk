import type { Metadata } from "next";
import Link from "next/link";
import { invoiceCopy, invoiceStatusLabel } from "@/lib/invoice-copy";
import { INVOICE_STATUSES } from "@/lib/invoice-form";
import { formatInvoiceDate } from "@/lib/invoice-money";
import { listInvoiceClients, listInvoices, invoiceDateKey } from "@/lib/invoices";
import { formatMoney } from "@/lib/money";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Invoices" };

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) return null;
  const params = await searchParams;
  const filters = {
    clientId: one(params.client),
    status: one(params.status),
    from: one(params.from),
    to: one(params.to),
    number: one(params.number),
  };
  const [invoices, clients] = await Promise.all([
    listInvoices(user.role, filters),
    listInvoiceClients(),
  ]);
  const filtered = Boolean(filters.clientId || filters.status || filters.from || filters.to || filters.number);

  return (
    <div id="invoice-list">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{invoiceCopy.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{invoiceCopy.intro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/invoices/settings" className={ui.secondaryButton}>
            {invoiceCopy.settings}
          </Link>
          <Link href="/invoices/new" className={ui.primaryButton}>
            {invoiceCopy.new}
          </Link>
        </div>
      </div>

      <form action="/invoices" method="get" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="block text-sm font-medium text-slate-800 lg:col-span-2">
          {invoiceCopy.client}
          <select name="client" defaultValue={filters.clientId} className={`${ui.input} mt-1.5`}>
            <option value="">{invoiceCopy.allClients}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-800">
          {invoiceCopy.status}
          <select name="status" defaultValue={filters.status} className={`${ui.input} mt-1.5`}>
            <option value="">{invoiceCopy.allStatuses}</option>
            {INVOICE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {invoiceStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-800">
          {invoiceCopy.number}
          <input name="number" defaultValue={filters.number} className={`${ui.input} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          From
          <input name="from" type="date" defaultValue={filters.from} className={`${ui.input} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          To
          <input name="to" type="date" defaultValue={filters.to} className={`${ui.input} mt-1.5`} />
        </label>
        <div className="flex items-end gap-2 lg:col-span-6">
          <button type="submit" className={ui.secondaryButton}>
            {invoiceCopy.applyFilters}
          </button>
          {filtered ? (
            <Link href="/invoices" className={ui.secondaryButton}>
              {invoiceCopy.clearFilters}
            </Link>
          ) : null}
        </div>
      </form>

      {invoices.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-ink">
            {filtered ? invoiceCopy.filterEmpty : invoiceCopy.emptyTitle}
          </h2>
          <p className="mt-2 text-sm text-slate-600">{filtered ? "" : invoiceCopy.emptyBody}</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">{invoiceCopy.number}</th>
                <th className="px-4 py-3 font-medium">{invoiceCopy.client}</th>
                <th className="px-4 py-3 font-medium">{invoiceCopy.dates}</th>
                <th className="px-4 py-3 font-medium">{invoiceCopy.total}</th>
                <th className="px-4 py-3 font-medium">{invoiceCopy.status}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link href={`/invoices/${invoice.id}`} className="hover:text-accent">
                      {invoice.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{invoice.client.name}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatInvoiceDate(invoiceDateKey(invoice.issueDate))}
                    <span className="text-slate-400"> – </span>
                    {formatInvoiceDate(invoiceDateKey(invoice.dueDate))}
                  </td>
                  <td className="px-4 py-3 text-slate-800">{formatMoney(invoice.totalMinor, invoice.currency)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {invoiceStatusLabel(invoice.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
