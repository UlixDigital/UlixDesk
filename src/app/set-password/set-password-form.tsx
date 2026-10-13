"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { setPasswordAction, type SetPasswordState } from "@/app/set-password/actions";
import { authCopy } from "@/lib/auth-copy";
import { ui } from "@/lib/ui";

const initial: SetPasswordState = { error: null };

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(setPasswordAction, initial);
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} readOnly />
      {state.error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-800">
          {authCopy.passwordLabel}
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" required className={`${ui.input} mt-1`} />
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-slate-800">
          {authCopy.confirmPassword}
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={`${ui.input} mt-1`} />
      </div>
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${ui.primaryButton} w-full`} disabled={pending}>
      {pending ? authCopy.savingPassword : authCopy.savePassword}
    </button>
  );
}
