import { fetchTimer } from "./api";
import { decideBadge } from "./badge";
import { readSettings } from "./storage";
import { hostPermissionPattern, isConfigured, normalizeServerUrl } from "./server-url";

export const ALARM_NAME = "ulixdesk-timer-sync";
export const ALARM_PERIOD_MINUTES = 1;
const BADGE_COLOR = "#0f766e";

async function syncBadge() {
  const settings = await readSettings();
  const parsed = normalizeServerUrl(settings.serverUrl);
  const configured = isConfigured(settings) && parsed.ok;
  const permission =
    configured && parsed.ok
      ? await chrome.permissions.contains({ origins: [hostPermissionPattern(parsed.origin)] })
      : false;

  let failure: "unauthorized" | "unreachable" | "other" | null = null;
  let timer: { startedAt: string; projectName: string } | null = null;
  if (configured && permission) {
    const result = await fetchTimer(settings);
    if (result.ok) {
      timer = result.timer;
    } else if (result.reason === "unauthorized") {
      failure = "unauthorized";
    } else if (result.reason === "unreachable") {
      failure = "unreachable";
    } else {
      failure = "other";
    }
  }

  const decision = decideBadge({
    configured,
    permission,
    failure,
    timer,
    now: Date.now(),
  });
  if (decision.action === "keep") return;

  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  await chrome.action.setBadgeText({ text: decision.action === "set" ? decision.text : "" });
  await chrome.action.setTitle({
    title: timer ? `UlixDesk timer running: ${timer.projectName}` : "UlixDesk Timer",
  });
}

function scheduleAlarm() {
  void chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarm();
  void syncBadge();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarm();
  void syncBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void syncBadge();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || message.type !== "refresh-badge") return false;
  void syncBadge().then(
    () => sendResponse({ ok: true }),
    () => sendResponse({ ok: false }),
  );
  return true;
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") void syncBadge();
});
