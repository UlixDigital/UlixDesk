"use server";

import { revalidatePath } from "next/cache";
import { authCopy } from "@/lib/auth-copy";
import { gateManager, publicOrigin } from "@/lib/auth";
import { setupLink, createTeamMember, resetTeamPassword, setTeamRole, setUserActive } from "@/lib/users";

export type TeamState = {
  error: string | null;
  link: string | null;
  linkNote: string | null;
  name: string;
  email: string;
  role: string;
};

const empty = { name: "", email: "", role: "member" };

export async function createTeamMemberAction(
  _previous: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "member"),
  };
  const gate = await gateManager();
  if (!gate.ok) {
    return { error: gate.error === authCopy.manageDenied ? authCopy.teamDenied : gate.error, link: null, linkNote: null, ...values };
  }
  const created = await createTeamMember({ actor: gate.user, ...values });
  if (!created.ok) return { error: created.error, link: null, linkNote: null, ...values };
  revalidatePath("/team");
  return {
    error: null,
    link: setupLink(await publicOrigin(), created.token),
    linkNote: authCopy.linkOnce,
    ...empty,
  };
}

export async function resetPasswordAction(
  _previous: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const gate = await gateManager();
  if (!gate.ok) {
    return { error: gate.error, link: null, linkNote: null, ...empty };
  }
  const result = await resetTeamPassword({
    actor: gate.user,
    userId: String(formData.get("userId") ?? ""),
  });
  if (!result.ok) return { error: result.error, link: null, linkNote: null, ...empty };
  return {
    error: null,
    link: setupLink(await publicOrigin(), result.token),
    linkNote: authCopy.resetLink,
    ...empty,
  };
}

export async function setRoleAction(formData: FormData) {
  const gate = await gateManager();
  if (!gate.ok) return;
  await setTeamRole({
    actor: gate.user,
    userId: String(formData.get("userId") ?? ""),
    role: String(formData.get("role") ?? ""),
  });
  revalidatePath("/team");
}

export async function setActiveAction(formData: FormData) {
  const gate = await gateManager();
  if (!gate.ok) return;
  await setUserActive({
    actor: gate.user,
    userId: String(formData.get("userId") ?? ""),
    active: formData.get("active") === "1",
  });
  revalidatePath("/team");
}
