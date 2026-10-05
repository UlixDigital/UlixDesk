"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clientsHref } from "@/lib/client-display";
import {
  archiveClient,
  createClient,
  getClient,
  restoreClient,
  updateClient,
} from "@/lib/clients";
import {
  parseClientFormData,
  validateClientInput,
  type ClientFormState,
} from "@/lib/validation";

export async function saveClientAction(
  _previous: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const values = parseClientFormData(formData);
  const result = validateClientInput(values);
  if (!result.ok) {
    return { errors: result.errors, values: result.values };
  }

  const id = String(formData.get("id") ?? "");

  if (!id) {
    try {
      await createClient(result.data);
    } catch (error) {
      console.error("Failed to create client", error);
      return {
        errors: { form: "Something went wrong saving this client. Try again." },
        values,
      };
    }
    revalidatePath("/clients");
    redirect("/clients");
  }

  const existing = await getClient(id);
  if (!existing) {
    return {
      errors: { form: "This client no longer exists." },
      values,
    };
  }

  try {
    const updated = await updateClient(id, result.data);
    if (!updated) {
      return {
        errors: { form: "This client no longer exists." },
        values,
      };
    }
  } catch (error) {
    console.error("Failed to update client", error);
    return {
      errors: { form: "Something went wrong saving this client. Try again." },
      values,
    };
  }

  revalidatePath("/clients");
  redirect(clientsHref(existing.archivedAt ? "archived" : "active"));
}

export async function archiveClientAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await archiveClient(id);
  revalidatePath("/clients");
}

export async function restoreClientAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await restoreClient(id);
  revalidatePath("/clients");
}
