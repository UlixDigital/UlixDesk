import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceCreateForm } from "@/components/invoice-create-form";
import { invoiceCopy } from "@/lib/invoice-copy";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { listInvoiceClients } from "@/lib/invoices";
import { getCurrentUser } from "@/lib/session";
import { addCalendarDays, startOfWeekDate, todayInTimeZone } from "@/lib/time-zone";
import { canManageWorkspace } from "@/lib/users-validation";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) return null;
  const [clients, settings] = await Promise.all([listInvoiceClients(), getInvoiceSettings()]);
  const today = todayInTimeZone(settings.timeZone);
  const thisMonday = startOfWeekDate(today);
  const periodStart = addCalendarDays(thisMonday, -7);
  const periodEnd = addCalendarDays(thisMonday, -1);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <p className="text-sm text-slate-500">
        <Link href="/invoices" className="hover:text-accent">
          {invoiceCopy.back}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{invoiceCopy.new}</h1>
      <p className="mt-1 text-sm text-slate-600">{invoiceCopy.intro}</p>
      <div className="mt-6" id="invoice-create">
        <InvoiceCreateForm clients={clients} periodStart={periodStart} periodEnd={periodEnd} />
      </div>
    </div>
  );
}
