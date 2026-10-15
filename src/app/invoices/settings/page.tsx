import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceSettingsForm } from "@/components/invoice-settings-form";
import { invoiceCopy } from "@/lib/invoice-copy";
import { getInvoiceSettings, invoiceSettingsFormValues } from "@/lib/invoice-settings";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";

export const metadata: Metadata = { title: "Invoice settings" };

export default async function InvoiceSettingsPage() {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) return null;
  const values = invoiceSettingsFormValues(await getInvoiceSettings());

  return (
    <div className="mx-auto w-full max-w-3xl" id="invoice-settings">
      <p className="text-sm text-slate-500">
        <Link href="/invoices" className="hover:text-accent">
          {invoiceCopy.back}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{invoiceCopy.settingsTitle}</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">{invoiceCopy.settingsIntro}</p>
      <div className="mt-6">
        <InvoiceSettingsForm {...values} />
      </div>
    </div>
  );
}
