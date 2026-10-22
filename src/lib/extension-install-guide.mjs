/**
 * One source for the public install page and the INSTALL.txt inside the zip.
 * The page renders `extensionInstallGuide`. The zip writes `installGuideText()`.
 * Nothing here is a secret. The download itself stays behind sign-in.
 */

export const extensionCardCopy = {
  title: "Chrome extension",
  missing: "The download isn't built yet.",
  missingHint: "Run npm run build:extension, then refresh this page.",
  download: "Download",
  guide: "Installation guide",
  steps: [
    "Unzip the download into a folder you will keep.",
    "Open chrome://extensions.",
    "Turn on Developer mode.",
    "Click Load unpacked and select that folder.",
    "Sign in with your server URL and email.",
  ],
  updateNote:
    "Unpacked extensions don't auto-update. When the version changes, download again and reload it on chrome://extensions.",
};

export const extensionInstallGuide = {
  title: "Install the UlixDesk Chrome extension",
  intro:
    "The extension is not in the Chrome Web Store. Download the zip, unzip it to a folder you will keep, and load that folder in Chrome. This page matches the INSTALL.txt file inside the zip. You can read it without signing in. Sign in and open Settings to download the zip.",
  steps: [
    {
      id: "download",
      title: "Download and unzip",
      figure: "unzip",
      body: "Download the zip from Settings and unzip it to a folder you will keep. Chrome loads the extension from that folder. Deleting the folder removes the extension.",
    },
    {
      id: "developer",
      title: "Turn on Developer mode",
      figure: "developer",
      body: "Open chrome://extensions and turn on Developer mode.",
    },
    {
      id: "load",
      title: "Load unpacked",
      figure: "load",
      body: "Click Load unpacked and select the unzipped folder. It must be the folder that contains manifest.json.",
    },
    {
      id: "pin",
      title: "Pin the extension",
      figure: "pin",
      body: "Click the puzzle icon on the Chrome toolbar and pin UlixDesk Timer so the button stays visible.",
    },
    {
      id: "sign-in",
      title: "Sign in",
      figure: "sign-in",
      body: "Open the extension. Enter the server URL, your email, and your password, then sign in. Use the origin only, such as https://desk.ulixdigital.com or http://127.0.0.1:3000, with no path on the end.",
    },
  ],
  update: {
    title: "Update",
    figure: "reload",
    body: "Unpacked extensions do not auto-update. When the version changes, download the new zip, replace the folder, then click Reload on chrome://extensions.",
  },
  troubleshooting: [
    {
      id: "manifest",
      title: "Manifest errors",
      figure: "manifest",
      body: "If Chrome reports a manifest error, the zip was not fully extracted or a file is missing. Load the folder that contains manifest.json, then click Reload.",
    },
    {
      id: "folder",
      title: "Wrong folder",
      figure: "folder",
      body: "Load unpacked must use the folder that contains manifest.json. Do not select the zip file, and do not select a parent folder that only contains the zip.",
    },
    {
      id: "url",
      title: "Sign-in fails",
      figure: "url",
      body: "Sign-in fails when the server URL is wrong. Check http or https, the host, and the port. A path on the end, or a different host than the site you use in the browser, will not sign in.",
    },
  ],
};

export function installGuideText(guide = extensionInstallGuide) {
  const lines = [guide.title, "", guide.intro, ""];
  for (const step of guide.steps) {
    lines.push(step.title, step.body, "");
  }
  lines.push(guide.update.title, guide.update.body, "", "Troubleshooting", "");
  for (const item of guide.troubleshooting) {
    lines.push(item.title, item.body, "");
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}
