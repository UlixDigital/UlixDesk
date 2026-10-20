import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceCreateForm } from "@/components/invoice-create-form";
import { invoiceCopy } from "@/lib/invoice-copy";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { listInvoiceClients } from "@/lib/invoices";
import { getCurrentUser } from "@/lib/session";
import { addCalendarDays, startOfWeekDate, todayInTimeZone } from "@/lib/time-zone";
import { canManageWorkspace } from "@/lib/users-validation";

type Search = { blank?: string; time?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const params = await searchParams;
  if (params.blank === "1") return { title: invoiceCopy.blankTitle };
  if (params.time === "1") return { title: invoiceCopy.fromTime };
  return { title: invoiceCopy.new };
}

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) return null;
  const params = await searchParams;
  const blank = params.blank === "1";
  const time = params.time === "1";
  const [clients, settings] = await Promise.all([listInvoiceClients(), getInvoiceSettings()]);
  const today = todayInTimeZone(settings.timeZone);
  const thisMonday = startOfWeekDate(today);
  const periodStart = addCalendarDays(thisMonday, -7);
  const periodEnd = addCalendarDays(thisMonday, -1);
  const title = blank ? invoiceCopy.blankTitle : time ? invoiceCopy.fromTime : invoiceCopy.new;
  const intro = blank ? invoiceCopy.blankIntro : time ? invoiceCopy.timeIntro : invoiceCopy.chooseIntro;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <p className="text-sm text-slate-500">
        <Link href="/invoices" className="hover:text-accent">
          {invoiceCopy.back}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mt-1 text-sm text-slate-600">{intro}</p>
      {blank || time ? (
        <div className="mt-6" id="invoice-create">
          <InvoiceCreateForm clients={clients} periodStart={periodStart} periodEnd={periodEnd} blank={blank} />
        </div>
      ) : (
        <div id="invoice-start-choices" className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            href="/invoices/new?blank=1"
            className="flex min-h-36 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-accent"
          >
            <span className="text-base font-semibold text-ink">{invoiceCopy.blankTitle}</span>
            <span className="mt-2 text-sm text-slate-600">{invoiceCopy.blankChoiceBody}</span>
          </Link>
          <Link
            href="/invoices/new?time=1"
            className="flex min-h-36 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-accent"
          >
            <span className="text-base font-semibold text-ink">{invoiceCopy.fromTime}</span>
            <span className="mt-2 text-sm text-slate-600">{invoiceCopy.timeChoiceBody}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
