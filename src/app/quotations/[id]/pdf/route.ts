import { renderStoredQuotationPdf } from "@/lib/quotation-send";
import { getQuotation } from "@/lib/quotations";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!canManageWorkspace(user.role)) return new Response("Forbidden", { status: 403 });
  const quotation = await getQuotation(user.role, (await context.params).id);
  if (!quotation) return new Response("Not found", { status: 404 });
  const pdf = await renderStoredQuotationPdf(quotation);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Quotation-${quotation.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
