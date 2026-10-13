"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { changePasswordAction, type PasswordState } from "@/app/settings/actions";
import { authCopy } from "@/lib/auth-copy";
import { ui } from "@/lib/ui";

const initial: PasswordState = { error: null, notice: null };

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initial);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState({ current: "", password: "", confirm: "" });
  const edited =
    current !== submitted.current || password !== submitted.password || confirm !== submitted.confirm;
  const error = edited ? null : state.error;

  useEffect(() => {
    if (!state.notice || state.error) return;
    setCurrent("");
    setPassword("");
    setConfirm("");
    setSubmitted({ current: "", password: "", confirm: "" });
  }, [state.error, state.notice]);

  return (
    <form
      action={async (formData) => {
        setSubmitted({
          current: String(formData.get("current") ?? ""),
          password: String(formData.get("password") ?? ""),
          confirm: String(formData.get("confirm") ?? ""),
        });
        await action(formData);
      }}
      className="mt-8 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,27,45,0.05)] sm:p-6"
    >
      <h2 className="text-lg font-semibold text-slate-900">{authCopy.changePasswordTitle}</h2>
      <p className="text-sm text-slate-600">{authCopy.changePasswordIntro}</p>
      {error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {!error && state.notice ? (
        <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {state.notice}
        </p>
      ) : null}
      <PasswordField
        id="current-password"
        name="current"
        label={authCopy.currentPassword}
        autoComplete="current-password"
        value={current}
        onChange={setCurrent}
      />
      <PasswordField
        id="new-password"
        name="password"
        label={authCopy.newPassword}
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
      />
      <PasswordField
        id="confirm-password"
        name="confirm"
        label={authCopy.confirmPassword}
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
      />
      <Submit />
    </form>
  );
}

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="password"
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${ui.input} mt-1`}
      />
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={ui.primaryButton} disabled={pending}>
      {pending ? authCopy.changingPassword : authCopy.changePassword}
    </button>
  );
}
