import { prisma } from "@/lib/db";
import { invoiceCopy } from "@/lib/invoice-copy";
import {
  clientViewPath,
  generateViewToken,
  hashViewToken,
  invoiceLinkKeyStatus,
  openViewToken,
  sealViewToken,
  viewTokenHashesMatch,
  type InvoiceLinkKeyStatus,
} from "@/lib/invoice-view-token";
import { canManageWorkspace } from "@/lib/users-validation";

type Actor = { id: string; role: string };

function denied() {
  return { ok: false as const, error: invoiceCopy.denied };
}

function missing() {
  return { ok: false as const, error: invoiceCopy.notFound };
}

function fail(error: string) {
  return { ok: false as const, error };
}

export async function rotateClientLink(input: { actor: Actor; id: string }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const keyStatus = invoiceLinkKeyStatus();
  if (keyStatus === "missing") return fail(invoiceCopy.linkKeyMissing);
  if (keyStatus === "invalid") return fail(invoiceCopy.linkKeyInvalid);
  const token = generateViewToken();
  const sealed = sealViewToken(token);
  const updated = await prisma.invoice.updateMany({
    where: { id: input.id },
    data: {
      viewTokenHash: hashViewToken(token),
      viewTokenCipher: sealed.cipher,
      viewTokenNonce: sealed.nonce,
    },
  });
  if (updated.count !== 1) return missing();
  return { ok: true as const, token, path: clientViewPath(token) };
}

export async function revokeClientLink(input: { actor: Actor; id: string }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const updated = await prisma.invoice.updateMany({
    where: { id: input.id, viewTokenHash: { not: null } },
    data: { viewTokenHash: null, viewTokenCipher: null, viewTokenNonce: null },
  });
  if (updated.count === 1) return { ok: true as const, revoked: true as const };
  const exists = await prisma.invoice.findUnique({ where: { id: input.id }, select: { id: true } });
  if (!exists) return missing();
  return { ok: true as const, revoked: false as const };
}

export type ClientLinkKeyProblem = Exclude<InvoiceLinkKeyStatus, "ok"> | "mismatch";

export type ClientLinkState =
  | { active: false }
  | { active: true; path: string | null; keyStatus: "ok" | ClientLinkKeyProblem };

export function clientLinkKeyMessage(status: ClientLinkKeyProblem) {
  if (status === "missing") return invoiceCopy.linkKeyMissingShow;
  if (status === "invalid") return invoiceCopy.linkKeyInvalidShow;
  return invoiceCopy.linkUnreadable;
}

/** Retrievable by owners and admins. The database stores the hash and a sealed copy. */
export async function readClientLink(actorRole: string, id: string): Promise<ClientLinkState | null> {
  if (!canManageWorkspace(actorRole)) return null;
  const row = await prisma.invoice.findUnique({
    where: { id },
    select: { viewTokenHash: true, viewTokenCipher: true, viewTokenNonce: true },
  });
  if (!row) return null;
  if (!row.viewTokenHash || !row.viewTokenCipher || !row.viewTokenNonce) return { active: false };
  const keyStatus = invoiceLinkKeyStatus();
  if (keyStatus !== "ok") return { active: true, path: null, keyStatus };
  const token = openViewToken(row.viewTokenNonce, row.viewTokenCipher);
  if (!token || !viewTokenHashesMatch(hashViewToken(token), row.viewTokenHash)) {
    return { active: true, path: null, keyStatus: "mismatch" };
  }
  return { active: true, path: clientViewPath(token), keyStatus: "ok" };
}

export function clientLinkUrl(origin: string, path: string) {
  return `${origin.replace(/\/$/, "")}${path}`;
}

/**
 * Uses the current link when it can be opened. Creates one when the invoice has none.
 * A sealed copy that no longer opens is left in place so a regenerate stays explicit.
 */
export async function ensureClientLink(input: { actor: Actor; id: string }) {
  const current = await readClientLink(input.actor.role, input.id);
  if (current === null) return missing();
  if (!current.active) return rotateClientLink(input);
  if (!current.path) return fail(clientLinkKeyMessage(current.keyStatus === "ok" ? "mismatch" : current.keyStatus));
  return { ok: true as const, token: null, path: current.path };
}
