import { popupCopy } from "./copy";
import { normalizeServerUrl } from "./server-url";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function describeSignIn(input: { serverUrl: string; email: string; password: string }):
  | { ok: true; serverUrl: string; email: string }
  | { ok: false; message: string } {
  const parsed = normalizeServerUrl(input.serverUrl);
  if (!parsed.ok) return { ok: false, message: popupCopy.invalidUrlBody };
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, message: popupCopy.emailRequired };
  if (email.length > 200 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, message: popupCopy.emailInvalid };
  }
  if (!input.password) return { ok: false, message: popupCopy.passwordRequired };
  return { ok: true, serverUrl: parsed.origin, email };
}
