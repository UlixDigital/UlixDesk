"use server";

import { redirect } from "next/navigation";
import { authCopy } from "@/lib/auth-copy";
import { originAllowed } from "@/lib/csrf";
import { consumeSetupToken } from "@/lib/users";
import { validateNewPassword } from "@/lib/users-validation";

export type SetPasswordState = {
  error: string | null;
};

export async function setPasswordAction(
  _previous: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  if (!(await originAllowed())) return { error: authCopy.csrfRejected };
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const problem = validateNewPassword(password, confirm);
  if (problem) return { error: problem };
  const saved = await consumeSetupToken(token, password);
  if (!saved.ok) return { error: saved.error };
  redirect("/login?password=saved");
}
