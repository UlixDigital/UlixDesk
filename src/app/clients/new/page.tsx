import type { Metadata } from "next";
import { ClientForm } from "@/components/client-form";
import { PermissionNote } from "@/components/permission-note";
import { saveClientAction } from "@/app/clients/actions";
import { authCopy } from "@/lib/auth-copy";
import { getWorkspaceCurrency } from "@/lib/bill-rates";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";
import { emptyClientFormValues } from "@/lib/validation";

export const metadata: Metadata = {
  title: "New client",
};

export default async function NewClientPage() {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) {
    return <PermissionNote message={authCopy.manageDenied} />;
  }
  const currency = await getWorkspaceCurrency();
  return (
    <ClientForm
      action={saveClientAction}
      initialState={{ errors: {}, values: { ...emptyClientFormValues, currency } }}
      title="New client"
      description="Add a company or contact. A name is enough. Address, billing address, phone, and billing emails can come later."
      submitLabel="Create client"
      cancelHref="/clients"
      autoFocusName
    />
  );
}
