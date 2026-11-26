import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuotationActions } from "@/components/quotation-actions";
import { QuotationClientLink } from "@/components/quotation-client-link";
import { QuotationDraftForm } from "@/components/quotation-draft-form";
import { QuotationHistory } from "@/components/quotation-history";
import { QuotationSendDialog } from "@/components/quotation-send-dialog";
import { publicOrigin } from "@/lib/auth";
import { clientLinkUrl } from "@/lib/invoice-link";
import { invoiceMailConfigured } from "@/lib/invoice-mail";
import {
  formatInvoiceDate,
  formatPercentBps,
  invoiceLineDetail,
  invoiceLineQuantity,
} from "@/lib/invoice-money";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { formatMoney, formatMoneyNumber } from "@/lib/money";
import { quotationCopy, quotationStatusLabel } from "@/lib/quotation-copy";
import { quotationLinkKeyMessage, readQuotationLink } from "@/lib/quotation-link";
import { quotationMessageDefaults } from "@/lib/quotation-send";
import { quotationDisplayStatus } from "@/lib/quotation-status";
import { getQuotation, quotationDateKey } from "@/lib/quotations";
import { utcDateKey } from "@/lib/rates";
import { getCurrentUser } from "@/lib/session";
import { todayInTimeZone } from "@/lib/time-zone";
import { canManageWorkspace } from "@/lib/users-validation";
import { ui } from "@/lib/ui";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> };

const notices: Record<string, string> = {
  sent: quotationCopy.markedSent,
  accepted: quotationCopy.accepted,
  declined: quotationCopy.declined,
  duplicated: quotationCopy.duplicated,
  emailed: quotationCopy.sent,
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) return { title: "Quotations" };
  const quotation = await getQuotation(user.role, (await params).id);
  return { title: quotation ? `Quotation ${quotation.number}` : "Quotation" };
}

export default async function QuotationDetailPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) return null;
  const quotation = await getQuotation(user.role, (await params).id);
  if (!quotation) notFound();
  const noticeKey = (await searchParams).notice ?? "";
  const pageNotice = notices[noticeKey] ?? null;
  const settings = await getInvoiceSettings();
  const today = todayInTimeZone(settings.timeZone);
  const issueDate = quotationDateKey(quotation.issueDate);
  const validUntil = quotationDateKey(quotation.validUntil);
  const display = quotationDisplayStatus({ status: quotation.status, validUntil, today });
  const link = await readQuotationLink(user.role, quotation.id);
  const origin = await publicOrigin();
  const linkPath = link?.active ? link.path : null;
  const keyMessage = link?.active && !link.path ? quotationLinkKeyMessage(link.keyStatus === "ok" ? "mismatch" : link.keyStatus) : null;
  const clientUrl = linkPath ? clientLinkUrl(origin, linkPath) : null;
  const defaults = quotationMessageDefaults({
    number: quotation.number,
    companyName: settings.companyName,
    total: formatMoney(quotation.totalMinor, quotation.currency),
    validUntil: formatInvoiceDate(validUntil),
    clientUrl,
  });
  const openForDecision = quotation.status === "draft" || quotation.status === "sent";
  const canEmail = openForDecision;

  return (
    <div className="mx-auto w-full max-w-5xl" id="quotation-detail">
      <p className="text-sm text-slate-500">
        <Link href="/quotations" className="hover:text-accent">
          {quotationCopy.back}
        </Link>
      </p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {quotationCopy.documentTitle} {quotation.number}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {quotation.client.name}
            <span className="text-slate-400"> · </span>
            <span id="quotation-status">{quotationStatusLabel(display)}</span>
            <span className="text-slate-400"> · </span>
            {quotation.currency}
          </p>
        </div>
        <a href={`/quotations/${quotation.id}/pdf`} className={ui.secondaryButton}>
          {quotationCopy.download}
        </a>
      </div>

      {pageNotice ? (
        <p role="status" className="mt-6 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {pageNotice}
        </p>
      ) : null}
      {display === "expired" ? (
        <p role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
          {quotationCopy.expiredBanner}
        </p>
      ) : null}
      {quotation.invoice ? (
        <p className="mt-4 text-sm text-slate-700">
          <Link href={`/invoices/${quotation.invoice.id}`} className="font-medium text-accent hover:underline">
            {quotationCopy.convertedLink} {quotation.invoice.number}
          </Link>
        </p>
      ) : null}

      {quotation.status === "draft" ? (
        <div className="mt-6">
          <QuotationDraftForm
            quotationId={quotation.id}
            currency={quotation.currency}
            issueDate={issueDate}
            validUntil={validUntil}
            notes={quotation.notes}
            terms={quotation.terms}
            taxEnabled={quotation.taxEnabled}
            taxLabel={quotation.taxLabel}
            taxRate={formatPercentBps(quotation.taxRateBps).replace("%", "")}
            lines={quotation.lines.map((line) => ({
              key: line.id,
              quantityKind: line.quantityKind === "hours" ? "hours" : "item",
              title: line.title,
              detail: line.detail,
              rangeStart: line.rangeStart ? utcDateKey(line.rangeStart) : "",
              rangeEnd: line.rangeEnd ? utcDateKey(line.rangeEnd) : "",
              quantity: invoiceLineQuantity(line),
              unitPrice: formatMoneyNumber(line.unitPriceMinor, quotation.currency),
            }))}
          />
        </div>
      ) : (
        <QuotationReadOnly quotation={quotation} />
      )}

      <div className="mt-8 flex flex-wrap items-start gap-3">
        {canEmail ? (
          <QuotationSendDialog
            quotationId={quotation.id}
            draft={quotation.status === "draft"}
            mailConfigured={invoiceMailConfigured()}
            defaultTo={quotation.client.emails.map((email) => email.email).join(", ")}
            defaultSubject={defaults.subject}
            defaultBody={defaults.body}
          />
        ) : null}
      </div>
      <QuotationActions
        quotationId={quotation.id}
        canDecide={openForDecision}
        canConvert={quotation.status === "accepted" && !quotation.invoice}
      />

      {quotation.status !== "draft" ? (
        <p className="mt-4 text-sm text-slate-600">{quotationCopy.readOnly}</p>
      ) : null}

      <div className="mt-8">
        <QuotationClientLink quotationId={quotation.id} url={clientUrl} keyMessage={keyMessage} draft={quotation.status === "draft"} />
      </div>
      {quotation.statusEvents.length > 0 || quotation.emailsSent.length > 0 ? (
        <div className="mt-8">
          <QuotationHistory events={quotation.statusEvents} emails={quotation.emailsSent} timeZone={settings.timeZone} />
        </div>
      ) : null}
    </div>
  );
}

function QuotationReadOnly({
  quotation,
}: {
  quotation: NonNullable<Awaited<ReturnType<typeof getQuotation>>>;
}) {
  const quantityHeader = quotation.lines.some((line) => line.quantityKind === "item") ? quotationCopy.qty : quotationCopy.hours;
  return (
    <div className="mt-6 space-y-6">
      <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">{quotationCopy.issueDate}</dt>
          <dd>{formatInvoiceDate(quotationDateKey(quotation.issueDate))}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{quotationCopy.validUntil}</dt>
          <dd>{formatInvoiceDate(quotationDateKey(quotation.validUntil))}</dd>
        </div>
      </dl>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
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
            {quotation.lines.map((line) => {
              const range = invoiceLineDetail({
                detail: "",
                rangeStart: line.rangeStart ? utcDateKey(line.rangeStart) : null,
                rangeEnd: line.rangeEnd ? utcDateKey(line.rangeEnd) : null,
              });
              return (
                <tr key={line.id} className="border-t border-slate-200">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{line.title}</p>
                    {line.detail ? <p className="mt-1 whitespace-pre-wrap text-xs font-normal text-slate-600">{line.detail}</p> : null}
                    {range ? <p className="text-slate-500">{range}</p> : null}
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
      <dl id="quotation-totals" className="grid gap-2 text-sm sm:ml-auto sm:max-w-xs">
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
        <div className="flex justify-between gap-6 font-semibold text-ink">
          <dt>{quotationCopy.total}</dt>
          <dd>{formatMoney(quotation.totalMinor, quotation.currency)}</dd>
        </div>
      </dl>
      {quotation.notes ? (
        <section>
          <h2 className="text-sm font-semibold text-ink">{quotationCopy.notes}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{quotation.notes}</p>
        </section>
      ) : null}
      {quotation.terms ? (
        <section>
          <h2 className="text-sm font-semibold text-ink">{quotationCopy.terms}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{quotation.terms}</p>
        </section>
      ) : null}
    </div>
  );
}
