import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UlixLogo } from "@/components/ulix-logo";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import {
  formatInvoiceDate,
  formatPercentBps,
  invoiceLineDetail,
  invoiceLineQuantity,
} from "@/lib/invoice-money";
import { formatMoney } from "@/lib/money";
import { quotationCopy, quotationStatusLabel } from "@/lib/quotation-copy";
import { findPublicQuotation, takePublicQuotationRead } from "@/lib/quotation-public";
import { quotationDisplayStatus } from "@/lib/quotation-status";
import { normalizeInvoiceText } from "@/lib/invoice-text";
import { utcDateKey } from "@/lib/rates";
import { requestIp } from "@/lib/request-headers";
import { todayInTimeZone } from "@/lib/time-zone";
import { ui } from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quotation",
  robots: { index: false, follow: false },
};

export default async function PublicQuotationPage({ params }: { params: Promise<{ token: string }> }) {
  const slot = await takePublicQuotationRead(await requestIp());
  if (slot.limited) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {quotationCopy.publicLimited}
        </p>
      </main>
    );
  }
  const { token } = await params;
  const quotation = await findPublicQuotation(token);
  if (!quotation) notFound();
  const today = todayInTimeZone((await getInvoiceSettings()).timeZone);
  const display = quotationDisplayStatus({
    status: quotation.status,
    validUntil: utcDateKey(quotation.validUntil),
    today,
  });
  const notes = normalizeInvoiceText(quotation.notes);
  const terms = normalizeInvoiceText(quotation.terms);
  const quantityHeader = quotation.lines.some((line) => line.quantityKind === "item") ? quotationCopy.qty : quotationCopy.hours;
  return (
    <main id="public-quotation" className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{quotationStatusLabel(display)}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {quotationCopy.documentTitle} {quotation.number}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{quotation.clientName}</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <UlixLogo height={36} />
          <a href={`/q/${encodeURIComponent(token)}/pdf`} className={ui.secondaryButton}>
            {quotationCopy.publicDownload}
          </a>
        </div>
      </header>
      {display === "expired" ? (
        <p role="status" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
          {quotationCopy.expiredBanner}
        </p>
      ) : null}
      <dl className="mt-6 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">{quotationCopy.issueDate}</dt>
          <dd>{formatInvoiceDate(utcDateKey(quotation.issueDate))}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{quotationCopy.validUntil}</dt>
          <dd>{formatInvoiceDate(utcDateKey(quotation.validUntil))}</dd>
        </div>
      </dl>
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">{quotationCopy.description}</th>
              <th className="px-4 py-3 font-medium">{quantityHeader}</th>
              <th className="px-4 py-3 font-medium">{quotationCopy.unitPrice}</th>
              <th className="px-4 py-3 font-medium">{quotationCopy.amount}</th>
            </tr>
          </thead>
          <tbody>
            {quotation.lines.map((line, index) => {
              const detail = invoiceLineDetail({
                detail: line.detail,
                rangeStart: line.rangeStart ? utcDateKey(line.rangeStart) : null,
                rangeEnd: line.rangeEnd ? utcDateKey(line.rangeEnd) : null,
              });
              return (
                <tr key={`${line.title}-${index}`} className="border-t border-slate-200">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{line.title}</p>
                    {detail ? <p className="text-slate-500">{detail}</p> : null}
                  </td>
                  <td className="px-4 py-3">{invoiceLineQuantity(line)}</td>
                  <td className="px-4 py-3">{formatMoney(line.unitPriceMinor, quotation.currency)}</td>
                  <td className="px-4 py-3">{formatMoney(line.amountMinor, quotation.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:ml-auto sm:max-w-xs">
        <div className="flex justify-between gap-6">
          <dt>{quotationCopy.subtotal}</dt>
          <dd>{formatMoney(quotation.subtotalMinor, quotation.currency)}</dd>
        </div>
        {quotation.taxEnabled ? (
          <div className="flex justify-between gap-6">
            <dt>
              {quotation.taxLabel} ({formatPercentBps(quotation.taxRateBps)})
            </dt>
            <dd>{formatMoney(quotation.taxMinor, quotation.currency)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-6 font-semibold">
          <dt>{quotationCopy.total}</dt>
          <dd>{formatMoney(quotation.totalMinor, quotation.currency)}</dd>
        </div>
      </dl>
      {notes ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-ink">{quotationCopy.notes}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{notes}</p>
        </section>
      ) : null}
      {terms ? (
        <section className="mt-4">
          <h2 className="text-sm font-semibold text-ink">{quotationCopy.terms}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{terms}</p>
        </section>
      ) : null}
    </main>
  );
}
