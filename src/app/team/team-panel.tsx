"use client";

import { useActionState, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  createTeamMemberAction,
  resetPasswordAction,
  setActiveAction,
  setRoleAction,
  type TeamState,
} from "@/app/team/actions";
import { authCopy } from "@/lib/auth-copy";
import { assignableRoles, roleLabel, type UserRole } from "@/lib/users-validation";
import { ui } from "@/lib/ui";

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  deactivated: boolean;
};

const initial: TeamState = {
  error: null,
  link: null,
  linkNote: null,
  name: "",
  email: "",
  role: "member",
};

export function TeamPanel({
  actorId,
  actorRole,
  people,
}: {
  actorId: string;
  actorRole: string;
  people: TeamRow[];
}) {
  const [created, createAction] = useActionState(createTeamMemberAction, initial);
  const [reset, resetAction] = useActionState(resetPasswordAction, initial);
  const roles = assignableRoles(actorRole);
  const link = created.link ?? reset.link;
  const linkNote = created.link ? created.linkNote : reset.link ? reset.linkNote : null;
  const error = created.error ?? reset.error;

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{authCopy.teamTitle}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">{authCopy.teamIntro}</p>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {link ? (
        <div role="status" className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
          <p className="font-medium">{linkNote}</p>
          <p className="mt-2 break-all font-mono text-xs">{link}</p>
        </div>
      ) : null}

      <form action={createAction} className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-end">
        <Field label={authCopy.nameLabel} name="name" defaultValue={created.name} autoComplete="name" />
        <Field label={authCopy.emailLabel} name="email" type="email" defaultValue={created.email} autoComplete="off" />
        <RoleSelect roles={roles} defaultValue={created.role} />
        <AddButton />
      </form>

      <ul className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {people.map((person) => (
          <li key={person.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{person.name}</p>
              <p className="truncate text-sm text-slate-600">{person.email}</p>
              <p className="mt-1 text-xs text-slate-500">
                {roleLabel(person.role)} · {person.deactivated ? authCopy.deactivatedStatus : authCopy.active}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {person.id !== actorId && roles.includes(person.role as UserRole) ? (
                <form action={setRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={person.id} readOnly />
                  <label className="sr-only" htmlFor={`role-${person.id}`}>
                    {authCopy.roleLabel} for {person.name}
                  </label>
                  <select id={`role-${person.id}`} name="role" defaultValue={person.role} className={ui.input}>
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={ui.secondaryButton}>
                    {authCopy.saveRole}
                  </button>
                </form>
              ) : null}
              {person.id !== actorId && (actorRole === "owner" || person.role !== "owner") ? (
                <>
                  <form action={resetAction}>
                    <input type="hidden" name="userId" value={person.id} readOnly />
                    <button type="submit" className={ui.secondaryButton}>
                      {authCopy.resetPassword}
                    </button>
                  </form>
                  {person.deactivated ? (
                    <form action={setActiveAction}>
                      <input type="hidden" name="userId" value={person.id} readOnly />
                      <input type="hidden" name="active" value="1" readOnly />
                      <button type="submit" className={ui.primaryButton}>
                        {authCopy.restore}
                      </button>
                    </form>
                  ) : (
                    <DeactivateButton id={person.id} name={person.name} />
                  )}
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  autoComplete,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  autoComplete: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input id={id} name={name} type={type} defaultValue={defaultValue} autoComplete={autoComplete} className={`${ui.input} mt-1`} />
    </div>
  );
}

function RoleSelect({ roles, defaultValue }: { roles: UserRole[]; defaultValue: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {authCopy.roleLabel}
      </label>
      <select id={id} name="role" defaultValue={defaultValue} className={`${ui.input} mt-1`}>
        {roles.map((role) => (
          <option key={role} value={role}>
            {roleLabel(role)}
          </option>
        ))}
      </select>
    </div>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={ui.primaryButton} disabled={pending}>
      {pending ? authCopy.adding : authCopy.addMember}
    </button>
  );
}

function DeactivateButton({ id, name }: { id: string; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button type="button" className={ui.secondaryButton} onClick={() => dialogRef.current?.showModal()}>
        {authCopy.deactivate}
        <span className="sr-only"> {name}</span>
      </button>
      <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby={titleId}>
        <form action={setActiveAction} className="w-[min(100%,28rem)] rounded-xl bg-white p-6 shadow-xl">
          <input type="hidden" name="userId" value={id} readOnly />
          <input type="hidden" name="active" value="0" readOnly />
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            {authCopy.deactivateTitle}
          </h2>
          <p className="mt-2 text-sm text-slate-600">{authCopy.deactivateBody}</p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className={ui.secondaryButton} onClick={() => dialogRef.current?.close()}>
              {authCopy.cancel}
            </button>
            <button type="submit" className={ui.dangerButton}>
              {authCopy.deactivateConfirm}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
