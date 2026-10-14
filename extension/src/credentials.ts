import { refreshSession, revokeSession } from "./api";
import { popupCopy } from "./copy";
import { clearCredential, readSettings, writeSettings, type ExtensionSettings } from "./storage";

const REFRESH_SKEW_MS = 60_000;

export type EnsureResult =
  | { ok: true; settings: ExtensionSettings }
  | { ok: false; signedOut: boolean; message: string };

export function accessStillValid(settings: ExtensionSettings, now = Date.now()) {
  if (!settings.token) return false;
  if (!settings.refreshToken) return true;
  const expires = Date.parse(settings.accessExpiresAt);
  if (Number.isNaN(expires)) return false;
  return expires - now > REFRESH_SKEW_MS;
}

let refreshInFlight: Promise<EnsureResult> | null = null;

/** Refreshes a short-lived access token. One refresh runs at a time in this worker. */
export function ensureAccess(options?: { force?: boolean }): Promise<EnsureResult> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = ensureAccessOnce(options?.force ?? false).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function ensureAccessOnce(force: boolean): Promise<EnsureResult> {
  const settings = await readSettings();
  if (!settings.token && !settings.refreshToken) return { ok: false, signedOut: true, message: "" };
  if (!settings.refreshToken) return { ok: true, settings };
  if (!force && accessStillValid(settings)) return { ok: true, settings };
  return refreshAndStore(settings);
}

async function refreshAndStore(settings: ExtensionSettings): Promise<EnsureResult> {
  const result = await refreshSession({
    serverUrl: settings.serverUrl,
    refreshToken: settings.refreshToken,
  });
  if (result.ok) {
    const next: ExtensionSettings = {
      ...settings,
      token: result.session.accessToken,
      refreshToken: result.session.refreshToken,
      accessExpiresAt: result.session.accessExpiresAt,
      userName: result.session.user.name,
      userEmail: result.session.user.email,
    };
    await writeSettings({
      token: next.token,
      refreshToken: next.refreshToken,
      accessExpiresAt: next.accessExpiresAt,
      userName: next.userName,
      userEmail: next.userEmail,
    });
    return { ok: true, settings: next };
  }

  if (result.code === "REFRESH_INVALID") {
    const latest = await readSettings();
    if (
      latest.refreshToken &&
      latest.refreshToken !== settings.refreshToken &&
      latest.token &&
      accessStillValid(latest)
    ) {
      return { ok: true, settings: latest };
    }
  }

  if (result.reason === "unreachable" || result.reason === "invalid-response" || result.reason === "invalid-url") {
    return { ok: false, signedOut: false, message: result.message || popupCopy.unreachableBody };
  }

  await clearCredential();
  return { ok: false, signedOut: true, message: result.message };
}

export async function signOutOfExtension() {
  const settings = await readSettings();
  if (settings.refreshToken) {
    const result = await revokeSession({
      serverUrl: settings.serverUrl,
      refreshToken: settings.refreshToken,
    });
    if (!result.ok && result.reason !== "rejected") {
      return { ok: false as const, message: result.message };
    }
  }
  await clearCredential();
  return { ok: true as const };
}
