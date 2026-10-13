"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/app/login/actions";
import { authCopy } from "@/lib/auth-copy";
import { ui } from "@/lib/ui";

const initial: LoginState = { error: null, email: "" };

export function LoginForm({ next, notice }: { next: string; notice: string | null }) {
  const [state, action] = useActionState(loginAction, { ...initial });

  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next} readOnly />
      {notice ? (
        <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {notice}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-800">
          {authCopy.emailLabel}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className={`${ui.input} mt-1`}
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-800">
          {authCopy.passwordLabel}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={`${ui.input} mt-1`}
        />
      </div>
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${ui.primaryButton} w-full`} disabled={pending}>
      {pending ? authCopy.signingIn : authCopy.signIn}
    </button>
  );
}
