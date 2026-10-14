"use server";

import { revalidatePath } from "next/cache";
import { createAccessToken, parseTokenName, revokeAccessToken } from "@/lib/access-tokens";
import { authCopy } from "@/lib/auth-copy";
import { gateMutation } from "@/lib/auth";
import { revokeExtensionSession } from "@/lib/extension-session";
import { currentSessionTokenHash } from "@/lib/session";
import { tokenCopy } from "@/lib/token-copy";
import type { CreateTokenState } from "@/lib/token-form-state";
import { changeOwnPassword } from "@/lib/users";
import { validateNewPassword } from "@/lib/users-validation";

export type PasswordState = { error: string | null; notice: string | null };

export async function changePasswordAction(
  _previous: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const gate = await gateMutation();
  if (!gate.ok) return { error: gate.error, notice: null };
  const currentPassword = String(formData.get("current") ?? "");
  const nextPassword = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!currentPassword) return { error: authCopy.passwordRequired, notice: null };
  const problem = validateNewPassword(nextPassword, confirm);
  if (problem) return { error: problem, notice: null };
  const saved = await changeOwnPassword({
    userId: gate.user.id,
    currentPassword,
    nextPassword,
    keepSessionTokenHash: await currentSessionTokenHash(),
  });
  if (!saved.ok) return { error: saved.error, notice: null };
  return { error: null, notice: authCopy.passwordChanged };
}

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

export async function revokeExtensionSessionAction(formData: FormData) {
  const gate = await gateMutation();
  if (!gate.ok) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await revokeExtensionSession(id, gate.user.id);
  } catch {
    console.error("Failed to revoke an extension sign-in");
  }
  revalidatePath("/settings");
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
