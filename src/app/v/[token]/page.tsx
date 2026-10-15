import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWorkspaceTimeZone } from "@/lib/bill-rates";
import { isOverdue } from "@/lib/invoice-balance";
import { invoiceCopy, invoiceStatusLabel } from "@/lib/invoice-copy";
import { amountDueMinor, formatDurationHms, formatInvoiceDate, formatPercentBps } from "@/lib/invoice-money";
import { findPublicInvoice, takePublicInvoiceRead } from "@/lib/invoice-public";
import { formatMoney } from "@/lib/money";
import { utcDateKey } from "@/lib/rates";
import { requestIp } from "@/lib/request-headers";
import { todayInTimeZone } from "@/lib/time-zone";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const slot = await takePublicInvoiceRead(await requestIp());
  if (slot.limited) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {invoiceCopy.publicLimited}
        </p>
      </main>
    );
  }
  const { token } = await params;
  const invoice = await findPublicInvoice(token);
  if (!invoice) notFound();
  const dueMinor = amountDueMinor(invoice.totalMinor, invoice.paidMinor);
  const overdue = isOverdue({
    dueDate: utcDateKey(invoice.dueDate),
    today: todayInTimeZone(await getWorkspaceTimeZone()),
    dueMinor,
  });
  const rows = [
    [invoiceCopy.subtotal, formatMoney(invoice.subtotalMinor, invoice.currency)],
    ...(invoice.discountMinor > 0 ? [[invoiceCopy.discount, formatMoney(-invoice.discountMinor, invoice.currency)]] : []),
    ...(invoice.taxEnabled
      ? [[`${invoice.taxLabel} (${formatPercentBps(invoice.taxRateBps)})`, formatMoney(invoice.taxMinor, invoice.currency)]]
      : []),
    [invoiceCopy.total, formatMoney(invoice.totalMinor, invoice.currency)],
    [invoiceCopy.paid, formatMoney(invoice.paidMinor, invoice.currency)],
    [invoiceCopy.amountDue, formatMoney(dueMinor, invoice.currency)],
  ];
  return (
    <main id="public-invoice" className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{invoiceStatusLabel(invoice.status)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Invoice {invoice.number}</h1>
          <p className="mt-1 text-sm text-slate-600">{invoice.clientName}</p>
        </div>
        <a href={`/v/${encodeURIComponent(token)}/pdf`} className={ui.secondaryButton}>
          {invoiceCopy.publicDownload}
        </a>
      </div>
      {overdue ? (
        <p id="public-invoice-overdue" role="status" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
          {invoiceCopy.publicOverdue}
        </p>
      ) : null}
      {invoice.status === "void" ? (
        <p role="status" className="mt-6 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-medium text-slate-800">
          {invoiceCopy.publicVoid}
        </p>
      ) : null}
      <dl className="mt-6 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">{invoiceCopy.issueDate}</dt>
          <dd>{formatInvoiceDate(utcDateKey(invoice.issueDate))}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{invoiceCopy.dueDate}</dt>
          <dd>{formatInvoiceDate(utcDateKey(invoice.dueDate))}</dd>
        </div>
      </dl>
      {invoice.poNumber ? <p className="mt-4 text-sm text-slate-700">PO {invoice.poNumber}</p> : null}
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">{invoiceCopy.description}</th>
              <th className="px-4 py-3 font-medium">{invoiceCopy.hours}</th>
              <th className="px-4 py-3 font-medium">{invoiceCopy.unitPrice}</th>
              <th className="px-4 py-3 font-medium">{invoiceCopy.amount}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={`${line.title}-${line.quantitySeconds}-${line.amountMinor}`} className="border-t border-slate-200">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{line.title}</p>
                  {line.detail ? <p className="text-slate-500">{line.detail}</p> : null}
                </td>
                <td className="px-4 py-3">{formatDurationHms(line.quantitySeconds)}</td>
                <td className="px-4 py-3">{formatMoney(line.unitPriceMinor, invoice.currency)}</td>
                <td className="px-4 py-3">{formatMoney(line.amountMinor, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-4 ml-auto w-full max-w-xs space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className={`flex justify-between ${label === invoiceCopy.amountDue ? "rounded bg-slate-50 px-2 py-1 font-semibold" : ""}`}
          >
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {invoice.notes ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-ink">{invoiceCopy.notes}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{invoice.notes}</p>
        </section>
      ) : null}
      {invoice.bankDetails.trim() ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-ink">{invoiceCopy.bank}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{invoice.bankDetails}</p>
        </section>
      ) : null}
    </main>
  );
}
