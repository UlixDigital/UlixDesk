import type { Metadata } from "next";
import Link from "next/link";
import { QuotationCreateForm } from "@/components/quotation-create-form";
import { quotationCopy } from "@/lib/quotation-copy";
import { listQuotationClients } from "@/lib/quotations";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";

export const metadata: Metadata = { title: "New quotation" };

export default async function NewQuotationPage() {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) return null;
  const clients = await listQuotationClients();
  return (
    <div className="mx-auto w-full max-w-2xl">
      <p className="text-sm text-slate-500">
        <Link href="/quotations" className="hover:text-accent">
          {quotationCopy.back}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{quotationCopy.new}</h1>
      <p className="mt-1 text-sm text-slate-600">{quotationCopy.newIntro}</p>
      <div className="mt-6" id="quotation-create">
        <QuotationCreateForm clients={clients} />
      </div>
    </div>
  );
}
