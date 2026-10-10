"use server";

import { revalidatePath } from "next/cache";
import { createAccessToken, parseTokenName, revokeAccessToken } from "@/lib/access-tokens";
import { tokenCopy } from "@/lib/token-copy";

export type CreateTokenState = {
  errors: { name?: string; form?: string };
  values: { name: string };
  token: string | null;
  tokenName: string | null;
};

export const emptyCreateTokenState: CreateTokenState = {
  errors: {},
  values: { name: "" },
  token: null,
  tokenName: null,
};

export async function createAccessTokenAction(
  _previous: CreateTokenState,
  formData: FormData,
): Promise<CreateTokenState> {
  const name = String(formData.get("name") ?? "");
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
    const created = await createAccessToken(parsed.name);
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
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await revokeAccessToken(id);
  } catch {
    console.error("Failed to revoke an access token");
  }
  revalidatePath("/settings");
}
