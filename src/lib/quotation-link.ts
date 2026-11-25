import { prisma } from "@/lib/db";
import { quotationCopy } from "@/lib/quotation-copy";
import type { ClientLinkKeyProblem, ClientLinkState } from "@/lib/invoice-link";
import {
  generateViewToken,
  hashViewToken,
  invoiceLinkKeyStatus,
  openViewToken,
  sealViewToken,
  viewTokenHashesMatch,
} from "@/lib/invoice-view-token";
import { canManageWorkspace } from "@/lib/users-validation";

type Actor = { id: string; role: string };

function denied() {
  return { ok: false as const, error: quotationCopy.denied };
}

function missing() {
  return { ok: false as const, error: quotationCopy.notFound };
}

function fail(error: string) {
  return { ok: false as const, error };
}

export function quotationViewPath(token: string) {
  return `/q/${token}`;
}

export function quotationLinkKeyMessage(status: ClientLinkKeyProblem) {
  if (status === "missing") return quotationCopy.linkKeyMissingShow;
  if (status === "invalid") return quotationCopy.linkKeyInvalidShow;
  return quotationCopy.linkUnreadable;
}

export async function rotateQuotationLink(input: { actor: Actor; id: string }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const keyStatus = invoiceLinkKeyStatus();
  if (keyStatus === "missing") return fail(quotationCopy.linkKeyMissing);
  if (keyStatus === "invalid") return fail(quotationCopy.linkKeyInvalid);
  const token = generateViewToken();
  const sealed = sealViewToken(token);
  const updated = await prisma.quotation.updateMany({
    where: { id: input.id },
    data: {
      viewTokenHash: hashViewToken(token),
      viewTokenCipher: sealed.cipher,
      viewTokenNonce: sealed.nonce,
    },
  });
  if (updated.count !== 1) return missing();
  return { ok: true as const, token, path: quotationViewPath(token) };
}

export async function revokeQuotationLink(input: { actor: Actor; id: string }) {
  if (!canManageWorkspace(input.actor.role)) return denied();
  const updated = await prisma.quotation.updateMany({
    where: { id: input.id, viewTokenHash: { not: null } },
    data: { viewTokenHash: null, viewTokenCipher: null, viewTokenNonce: null },
  });
  if (updated.count === 1) return { ok: true as const, revoked: true as const };
  const exists = await prisma.quotation.findUnique({ where: { id: input.id }, select: { id: true } });
  if (!exists) return missing();
  return { ok: true as const, revoked: false as const };
}

export async function readQuotationLink(actorRole: string, id: string): Promise<ClientLinkState | null> {
  if (!canManageWorkspace(actorRole)) return null;
  const row = await prisma.quotation.findUnique({
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
  return { active: true, path: quotationViewPath(token), keyStatus: "ok" };
}

export async function ensureQuotationLink(input: { actor: Actor; id: string }) {
  const current = await readQuotationLink(input.actor.role, input.id);
  if (current === null) return missing();
  if (!current.active) return rotateQuotationLink(input);
  if (!current.path) {
    return fail(quotationLinkKeyMessage(current.keyStatus === "ok" ? "mismatch" : current.keyStatus));
  }
  return { ok: true as const, token: null, path: current.path };
}
