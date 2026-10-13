"use server";

import { redirect } from "next/navigation";
import { authCopy } from "@/lib/auth-copy";
import { loginUser, logoutUser } from "@/lib/auth";
import { originAllowed } from "@/lib/csrf";
import { safeNextPath } from "@/lib/access-decision";
import { validateEmail } from "@/lib/users-validation";

export type LoginState = {
  error: string | null;
  email: string;
};

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? "/clients"));
  if (!(await originAllowed())) {
    return { error: authCopy.csrfRejected, email };
  }
  const parsed = validateEmail(email);
  if (!parsed.ok) return { error: parsed.error, email };
  if (!password) return { error: authCopy.passwordRequired, email };

  let result: Awaited<ReturnType<typeof loginUser>>;
  try {
    result = await loginUser(email, password);
  } catch (error) {
    console.error("Sign-in failed", error);
    return { error: authCopy.invalidLogin, email };
  }
  if (!result.ok) return { error: result.error, email };
  redirect(next);
}

export async function logoutAction() {
  if (!(await originAllowed())) redirect("/login");
  await logoutUser();
  redirect("/login?signedOut=1");
}
