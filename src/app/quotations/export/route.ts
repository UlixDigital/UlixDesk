import { quotationsToCsv } from "@/lib/quotation-csv";
import { quotationDisplayStatus } from "@/lib/quotation-status";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { getCurrentUser } from "@/lib/session";
import { todayInTimeZone } from "@/lib/time-zone";
import { canManageWorkspace } from "@/lib/users-validation";
import { listQuotations, quotationDateKey } from "@/lib/quotations";

export const dynamic = "force-dynamic";

function one(value: string | null) {
  return value?.trim() ?? "";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!canManageWorkspace(user.role)) return new Response("Forbidden", { status: 403 });
  const url = new URL(request.url);
  const filters = {
    clientId: one(url.searchParams.get("client")),
    status: one(url.searchParams.get("status")),
    from: one(url.searchParams.get("from")),
    to: one(url.searchParams.get("to")),
    number: one(url.searchParams.get("number")),
  };
  const today = todayInTimeZone((await getInvoiceSettings()).timeZone);
  const quotations = await listQuotations(user.role, filters, today);
  const csv = quotationsToCsv(
    quotations.map((quotation) => ({
      number: quotation.number,
      clientName: quotation.client.name,
      issueDate: quotationDateKey(quotation.issueDate),
      validUntil: quotationDateKey(quotation.validUntil),
      currency: quotation.currency,
      subtotalMinor: quotation.subtotalMinor,
      taxMinor: quotation.taxMinor,
      totalMinor: quotation.totalMinor,
      status: quotationDisplayStatus({
        status: quotation.status,
        validUntil: quotationDateKey(quotation.validUntil),
        today,
      }),
    })),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="quotations.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
