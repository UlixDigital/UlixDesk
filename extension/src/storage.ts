export const LOCAL_SETTING_KEYS = ["serverUrl", "token", "lastProjectId"] as const;

export type ExtensionSettings = {
  serverUrl: string;
  token: string;
  lastProjectId: string;
};

export function settingsFromStored(stored: Record<string, unknown>): ExtensionSettings {
  return {
    serverUrl: stringValue(stored.serverUrl),
    token: stringValue(stored.token),
    lastProjectId: stringValue(stored.lastProjectId),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function readSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get([...LOCAL_SETTING_KEYS]);
  return settingsFromStored(stored);
}

export async function writeSettings(patch: Partial<ExtensionSettings>) {
  const next: Record<string, string> = {};
  for (const key of LOCAL_SETTING_KEYS) {
    const value = patch[key];
    if (value !== undefined) next[key] = value;
  }
  await chrome.storage.local.set(next);
}
