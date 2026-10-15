import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDeleteForm } from "@/components/invoice-delete-form";
import { InvoiceDraftForm } from "@/components/invoice-draft-form";
import { invoiceCopy, invoiceStatusLabel } from "@/lib/invoice-copy";
import { unratedLineLabel } from "@/lib/invoice-lines";
import { amountDueMinor, formatDurationHms, formatInvoiceDate, formatPercentBps } from "@/lib/invoice-money";
import { getInvoice, invoiceDateKey, unratedForInvoice } from "@/lib/invoices";
import { formatMoney, formatMoneyNumber } from "@/lib/money";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";
import { ui } from "@/lib/ui";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) return { title: "Invoices" };
  const invoice = await getInvoice(user.role, (await params).id);
  return { title: invoice ? `Invoice ${invoice.number}` : "Invoice" };
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) return null;
  const invoice = await getInvoice(user.role, (await params).id);
  if (!invoice) notFound();
  const issueDate = invoiceDateKey(invoice.issueDate);
  const dueDate = invoiceDateKey(invoice.dueDate);
  const unrated = invoice.status === "draft" ? await unratedForInvoice(invoice) : [];
  const discountValue =
    invoice.discountKind === "percent"
      ? formatPercentBps(invoice.discountBps).replace("%", "")
      : invoice.discountKind === "amount"
        ? formatMoneyNumber(invoice.discountAmountMinor, invoice.currency)
        : "";

  return (
    <div className="mx-auto w-full max-w-5xl" id="invoice-detail">
      <p className="text-sm text-slate-500">
        <Link href="/invoices" className="hover:text-accent">
          {invoiceCopy.back}
        </Link>
      </p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Invoice {invoice.number}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {invoice.client.name}
            <span className="text-slate-400"> · </span>
            {invoiceStatusLabel(invoice.status)}
            <span className="text-slate-400"> · </span>
            {formatInvoiceDate(invoiceDateKey(invoice.periodStart))} – {formatInvoiceDate(invoiceDateKey(invoice.periodEnd))}
          </p>
        </div>
        <a href={`/invoices/${invoice.id}/pdf`} className={ui.secondaryButton}>
          {invoiceCopy.download}
        </a>
      </div>

      {unrated.length > 0 ? (
        <div role="status" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">{invoiceCopy.unratedTitle}</p>
          <p className="mt-1">{invoiceCopy.unratedBody}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {unrated.map((item) => (
              <li key={item.timeEntryId}>{unratedLineLabel(item)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {invoice.status === "draft" ? (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <InvoiceDraftForm
              invoiceId={invoice.id}
              currency={invoice.currency}
              issueDate={issueDate}
              dueDate={dueDate}
              poNumber={invoice.poNumber ?? ""}
              notes={invoice.notes}
              bankDetails={invoice.bankDetails}
              discountKind={invoice.discountKind}
              discountValue={discountValue}
              taxEnabled={invoice.taxEnabled}
              taxLabel={invoice.taxLabel}
              taxRate={formatPercentBps(invoice.taxRateBps).replace("%", "")}
              lines={invoice.lines.map((line) => ({
                key: line.id,
                id: line.id,
                title: line.title,
                detail: line.detail,
                quantity: formatDurationHms(line.quantitySeconds),
                unitPrice: formatMoneyNumber(line.unitPriceMinor, invoice.currency),
              }))}
            />
          </div>
          <InvoiceDeleteForm invoiceId={invoice.id} />
        </div>
      ) : (
        <IssuedInvoice
          currency={invoice.currency}
          lines={invoice.lines}
          subtotalMinor={invoice.subtotalMinor}
          discountMinor={invoice.discountMinor}
          taxEnabled={invoice.taxEnabled}
          taxLabel={invoice.taxLabel}
          taxRateBps={invoice.taxRateBps}
          taxMinor={invoice.taxMinor}
          totalMinor={invoice.totalMinor}
          paidMinor={invoice.paidMinor}
          notes={invoice.notes}
          bankDetails={invoice.bankDetails}
          poNumber={invoice.poNumber}
        />
      )}
    </div>
  );
}

function IssuedInvoice({
  currency,
  lines,
  subtotalMinor,
  discountMinor,
  taxEnabled,
  taxLabel,
  taxRateBps,
  taxMinor,
  totalMinor,
  paidMinor,
  notes,
  bankDetails,
  poNumber,
}: {
  currency: string;
  lines: Array<{
    id: string;
    title: string;
    detail: string;
    quantitySeconds: number;
    unitPriceMinor: number;
    amountMinor: number;
  }>;
  subtotalMinor: number;
  discountMinor: number;
  taxEnabled: boolean;
  taxLabel: string;
  taxRateBps: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  notes: string;
  bankDetails: string;
  poNumber: string | null;
}) {
  const rows = [
    [invoiceCopy.subtotal, formatMoney(subtotalMinor, currency)],
    ...(discountMinor > 0 ? [[invoiceCopy.discount, formatMoney(-discountMinor, currency)]] : []),
    ...(taxEnabled ? [[`${taxLabel} (${formatPercentBps(taxRateBps)})`, formatMoney(taxMinor, currency)]] : []),
    [invoiceCopy.total, formatMoney(totalMinor, currency)],
    [invoiceCopy.paid, formatMoney(paidMinor, currency)],
    [invoiceCopy.amountDue, formatMoney(amountDueMinor(totalMinor, paidMinor), currency)],
  ];
  return (
    <div className="mt-6 space-y-6">
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{invoiceCopy.readOnly}</p>
      {poNumber ? <p className="text-sm text-slate-700">PO {poNumber}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
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
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-slate-200">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{line.title}</p>
                  {line.detail ? <p className="text-slate-500">{line.detail}</p> : null}
                </td>
                <td className="px-4 py-3">{formatDurationHms(line.quantitySeconds)}</td>
                <td className="px-4 py-3">{formatMoney(line.unitPriceMinor, currency)}</td>
                <td className="px-4 py-3">{formatMoney(line.amountMinor, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto w-full max-w-xs space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className={`flex justify-between ${label === invoiceCopy.amountDue ? "rounded bg-slate-50 px-2 py-1 font-semibold" : ""}`}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {notes ? (
        <section>
          <h2 className="text-sm font-semibold text-ink">{invoiceCopy.notes}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{notes}</p>
        </section>
      ) : null}
      {bankDetails ? (
        <section>
          <h2 className="text-sm font-semibold text-ink">{invoiceCopy.bank}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{bankDetails}</p>
        </section>
      ) : null}
    </div>
  );
}
