import type { Metadata } from "next";
import { ClientForm } from "@/components/client-form";
import { saveClientAction } from "@/app/clients/actions";
import { emptyClientFormValues } from "@/lib/validation";

export const metadata: Metadata = {
  title: "New client",
};

export default function NewClientPage() {
  return (
    <ClientForm
      action={saveClientAction}
      initialState={{ errors: {}, values: emptyClientFormValues }}
      title="New client"
      description="Add a company or contact. A name is enough. Address, phone, and emails can come later."
      submitLabel="Create client"
      cancelHref="/clients"
      autoFocusName
    />
  );
}
