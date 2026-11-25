import type { Metadata } from "next";
import Link from "next/link";
import { quotationCopy, quotationStatusLabel, QUOTATION_STATUSES } from "@/lib/quotation-copy";
import { quotationDisplayStatus } from "@/lib/quotation-status";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { formatInvoiceDate } from "@/lib/invoice-money";
import { listQuotationClients, listQuotations, quotationDateKey } from "@/lib/quotations";
import { formatMoney } from "@/lib/money";
import { getCurrentUser } from "@/lib/session";
import { todayInTimeZone } from "@/lib/time-zone";
import { canManageWorkspace } from "@/lib/users-validation";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Quotations" };

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<Search> }) {
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
  const today = todayInTimeZone((await getInvoiceSettings()).timeZone);
  const [quotations, clients] = await Promise.all([
    listQuotations(user.role, filters, today),
    listQuotationClients(),
  ]);
  const filtered = Boolean(filters.clientId || filters.status || filters.from || filters.to || filters.number);
  const exportQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) exportQuery.set(key === "clientId" ? "client" : key, value);
  }
  const exportHref = exportQuery.size > 0 ? `/quotations/export?${exportQuery}` : "/quotations/export";

  return (
    <div id="quotation-list">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{quotationCopy.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{quotationCopy.intro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={exportHref} className={ui.secondaryButton}>
            {quotationCopy.exportCsv}
          </a>
          <Link href="/quotations/new" className={ui.primaryButton}>
            {quotationCopy.new}
          </Link>
        </div>
      </div>

      <form action="/quotations" method="get" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="block text-sm font-medium text-slate-800 lg:col-span-2">
          {quotationCopy.client}
          <select name="client" defaultValue={filters.clientId} className={`${ui.input} mt-1.5`}>
            <option value="">{quotationCopy.allClients}</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-800">
          {quotationCopy.status}
          <select name="status" defaultValue={filters.status} className={`${ui.input} mt-1.5`}>
            <option value="">{quotationCopy.allStatuses}</option>
            {QUOTATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {quotationStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-800">
          {quotationCopy.number}
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
            {quotationCopy.applyFilters}
          </button>
          {filtered ? (
            <Link href="/quotations" className={ui.secondaryButton}>
              {quotationCopy.clearFilters}
            </Link>
          ) : null}
        </div>
      </form>

      {quotations.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-ink">
            {filtered ? quotationCopy.filterEmpty : quotationCopy.emptyTitle}
          </h2>
          <p className="mt-2 text-sm text-slate-600">{filtered ? "" : quotationCopy.emptyBody}</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">{quotationCopy.number}</th>
                <th className="px-4 py-3 font-medium">{quotationCopy.client}</th>
                <th className="px-4 py-3 font-medium">{quotationCopy.dates}</th>
                <th className="px-4 py-3 font-medium">{quotationCopy.total}</th>
                <th className="px-4 py-3 font-medium">{quotationCopy.status}</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((quotation) => {
                const status = quotationDisplayStatus({
                  status: quotation.status,
                  validUntil: quotationDateKey(quotation.validUntil),
                  today,
                });
                return (
                  <tr key={quotation.id} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-medium text-ink">
                      <Link href={`/quotations/${quotation.id}`} className="hover:text-accent">
                        {quotation.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{quotation.client.name}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatInvoiceDate(quotationDateKey(quotation.issueDate))}
                      <span className="text-slate-400"> – </span>
                      {formatInvoiceDate(quotationDateKey(quotation.validUntil))}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{formatMoney(quotation.totalMinor, quotation.currency)}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {quotationStatusLabel(status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
