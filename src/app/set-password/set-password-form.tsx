"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { setPasswordAction, type SetPasswordState } from "@/app/set-password/actions";
import { authCopy } from "@/lib/auth-copy";
import { ui } from "@/lib/ui";

const initial: SetPasswordState = { error: null };

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(setPasswordAction, initial);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState({ password: "", confirm: "" });
  const edited = password !== submitted.password || confirm !== submitted.confirm;
  const error = edited ? null : state.error;

  return (
    <form
      action={async (formData) => {
        setSubmitted({
          password: String(formData.get("password") ?? ""),
          confirm: String(formData.get("confirm") ?? ""),
        });
        await action(formData);
      }}
      className="mt-6 space-y-4"
    >
      <input type="hidden" name="token" value={token} readOnly />
      {error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-800">
          {authCopy.passwordLabel}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={`${ui.input} mt-1`}
        />
      </div>
      <div>
        <label htmlFor="confirm" className="block text-sm font-medium text-slate-800">
          {authCopy.confirmPassword}
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className={`${ui.input} mt-1`}
        />
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
