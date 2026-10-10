import { testConnection } from "./api";
import { optionsCopy } from "./copy";
import { describeGrant, describeSave, describeTestConnection } from "./options-state";
import { readSettings, writeSettings } from "./storage";
import { hostPermissionPattern, normalizeServerUrl } from "./server-url";

const urlInput = document.querySelector<HTMLInputElement>("#server-url");
const tokenInput = document.querySelector<HTMLInputElement>("#access-token");
const status = document.querySelector<HTMLParagraphElement>("#status");
const saveButton = document.querySelector<HTMLButtonElement>("#save");
const grantButton = document.querySelector<HTMLButtonElement>("#grant");
const testButton = document.querySelector<HTMLButtonElement>("#test");

if (!urlInput || !tokenInput || !status || !saveButton || !grantButton || !testButton) {
  throw new Error("Options page is missing a control");
}

const serverUrlInput = urlInput;
const accessTokenInput = tokenInput;
const statusLine = status;
const saveControl = saveButton;
const grantControl = grantButton;
const testControl = testButton;

function show(tone: "success" | "error", message: string) {
  statusLine.textContent = message;
  statusLine.className = tone === "success" ? "status success" : "status error";
}

function requestBadgeRefresh() {
  void chrome.runtime.sendMessage({ type: "refresh-badge" });
}

saveControl.addEventListener("click", () => {
  void (async () => {
    const serverUrl = serverUrlInput.value;
    const token = accessTokenInput.value;
    const described = describeSave({ serverUrl, token });
    if (!described || described.tone === "error") {
      show("error", described?.message ?? optionsCopy.missingFields);
      return;
    }
    await writeSettings({ serverUrl: serverUrl.trim(), token: token.trim() });
    show(described.tone, described.message);
    requestBadgeRefresh();
  })();
});

grantControl.addEventListener("click", () => {
  const serverUrl = serverUrlInput.value;
  const parsed = normalizeServerUrl(serverUrl);
  if (!parsed.ok) {
    show("error", describeGrant({ serverUrl, granted: false }).message);
    return;
  }
  const pattern = hostPermissionPattern(parsed.origin);
  chrome.permissions.request({ origins: [pattern] }, (granted) => {
    void chrome.runtime.lastError;
    if (!granted) {
      show("error", optionsCopy.grantDenied);
      return;
    }
    chrome.permissions.getAll((current) => {
      const extras = (current.origins ?? []).filter((origin) => origin !== pattern);
      const finish = () => {
        show("success", optionsCopy.granted);
        requestBadgeRefresh();
      };
      if (extras.length === 0) {
        finish();
        return;
      }
      chrome.permissions.remove({ origins: extras }, () => {
        void chrome.runtime.lastError;
        finish();
      });
    });
  });
});

testControl.addEventListener("click", () => {
  void (async () => {
    const serverUrl = serverUrlInput.value;
    const token = accessTokenInput.value;
    const parsed = normalizeServerUrl(serverUrl);
    const permission = parsed.ok
      ? await chrome.permissions.contains({ origins: [hostPermissionPattern(parsed.origin)] })
      : false;
    if (!permission) {
      show("error", describeTestConnection({ serverUrl, token, permission: false, result: null }).message);
      return;
    }
    testControl.disabled = true;
    testControl.textContent = optionsCopy.testing;
    const result = await testConnection({ serverUrl, token });
    testControl.disabled = false;
    testControl.textContent = optionsCopy.test;
    const described = describeTestConnection({ serverUrl, token, permission: true, result });
    show(described.tone, described.message);
    requestBadgeRefresh();
  })();
});

void readSettings().then((settings) => {
  serverUrlInput.value = settings.serverUrl;
  accessTokenInput.value = settings.token;
});
