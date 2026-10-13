"use server";

import { revalidatePath } from "next/cache";
import { createAccessToken, parseTokenName, revokeAccessToken } from "@/lib/access-tokens";
import { gateMutation } from "@/lib/auth";
import { tokenCopy } from "@/lib/token-copy";
import type { CreateTokenState } from "@/lib/token-form-state";

export type { CreateTokenState };

export async function createAccessTokenAction(
  _previous: CreateTokenState,
  formData: FormData,
): Promise<CreateTokenState> {
  const name = String(formData.get("name") ?? "");
  const gate = await gateMutation();
  if (!gate.ok) {
    return { errors: { form: gate.error }, values: { name }, token: null, tokenName: null };
  }
  const parsed = parseTokenName(name);
  if (!parsed.ok) {
    return {
      errors: { name: parsed.error },
      values: { name },
      token: null,
      tokenName: null,
    };
  }

  try {
    const created = await createAccessToken(parsed.name, gate.user.id);
    revalidatePath("/settings");
    return {
      errors: {},
      values: { name: "" },
      token: created.token,
      tokenName: created.record.name,
    };
  } catch {
    console.error("Failed to create an access token");
    return {
      errors: { form: tokenCopy.createFailed },
      values: { name },
      token: null,
      tokenName: null,
    };
  }
}

export async function revokeAccessTokenAction(formData: FormData) {
  const gate = await gateMutation();
  if (!gate.ok) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await revokeAccessToken(id, gate.user.id);
  } catch {
    console.error("Failed to revoke an access token");
  }
  revalidatePath("/settings");
}
