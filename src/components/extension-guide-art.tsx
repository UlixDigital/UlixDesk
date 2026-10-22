import type { ReactNode } from "react";

const ink = "#1d1d1d";
const muted = "#475569";
const line = "#e2e8f0";
const page = "#f4f6f8";
const card = "#ffffff";
const blue = "#2177ff";
const deep = "#1151b4";
const accent = "#1f108c";
const wash = "#edf6ff";
const rose = "#be123c";
const roseWash = "#fff1f2";
const font = "Segoe UI, system-ui, sans-serif";

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 640 220" role="img" aria-label={label} className="h-auto w-full">
      <rect width="640" height="220" rx="16" fill={page} />
      {children}
    </svg>
  );
}

function Browser({ url, children }: { url: string; children: ReactNode }) {
  return (
    <>
      <rect x="16" y="16" width="608" height="188" rx="12" fill={card} stroke={line} />
      <rect x="16" y="16" width="608" height="40" rx="12" fill={wash} />
      <rect x="16" y="40" width="608" height="16" fill={wash} />
      <circle cx="38" cy="36" r="5" fill={blue} />
      <circle cx="56" cy="36" r="5" fill={deep} />
      <circle cx="74" cy="36" r="5" fill={accent} />
      <rect x="96" y="24" width="400" height="24" rx="7" fill={card} />
      <text x="108" y="40" fill={ink} fontFamily={font} fontSize="12">
        {url}
      </text>
      {children}
    </>
  );
}

function Folder({
  x,
  y,
  name,
  files,
  tone,
}: {
  x: number;
  y: number;
  name: string;
  files: string[];
  tone: "good" | "bad";
}) {
  const mark = tone === "good" ? deep : rose;
  return (
    <g>
      <path d={`M${x} ${y + 18} h36 l8 8 h88 v64 h-132 z`} fill={tone === "good" ? wash : roseWash} stroke={mark} />
      <text x={x + 12} y={y + 48} fill={ink} fontFamily={font} fontSize="13" fontWeight="600">
        {name}
      </text>
      {files.map((file, index) => (
        <text key={file} x={x + 12} y={y + 68 + index * 16} fill={muted} fontFamily={font} fontSize="11">
          {file}
        </text>
      ))}
    </g>
  );
}

export function ExtensionGuideFigure({ name }: { name: string }) {
  switch (name) {
    case "unzip":
      return (
        <Frame label="A zip file expanding into a folder you keep. Deleting that folder removes the extension.">
          <rect x="36" y="48" width="150" height="120" rx="12" fill={card} stroke={line} />
          <rect x="56" y="68" width="110" height="72" rx="8" fill={wash} stroke={deep} />
          <text x="70" y="100" fill={accent} fontFamily={font} fontSize="13" fontWeight="700">
            ZIP
          </text>
          <text x="70" y="120" fill={muted} fontFamily={font} fontSize="11">
            ulixdesk-extension
          </text>
          <path d="M220 108 h70" stroke={deep} strokeWidth="3" />
          <path d="M278 98 l16 10 -16 10" fill={deep} />
          <Folder x={330} y={46} name="ulixdesk" files={["manifest.json", "INSTALL.txt"]} tone="good" />
          <text x="330" y="196" fill={deep} fontFamily={font} fontSize="12" fontWeight="600">
            Keep this folder
          </text>
        </Frame>
      );
    case "developer":
      return (
        <Frame label="The chrome://extensions page with Developer mode switched on.">
          <Browser url="chrome://extensions">
            <text x="40" y="84" fill={ink} fontFamily={font} fontSize="16" fontWeight="700">
              Extensions
            </text>
            <rect x="430" y="68" width="168" height="32" rx="16" fill={card} stroke={line} />
            <text x="444" y="89" fill={ink} fontFamily={font} fontSize="12">
              Developer mode
            </text>
            <rect x="552" y="74" width="36" height="20" rx="10" fill={deep} />
            <circle cx="578" cy="84" r="7" fill={card} />
          </Browser>
        </Frame>
      );
    case "load":
      return (
        <Frame label="Load unpacked is clicked, and the folder that contains manifest.json is selected.">
          <Browser url="chrome://extensions">
            <rect x="40" y="72" width="150" height="32" rx="8" fill={deep} />
            <text x="58" y="93" fill={card} fontFamily={font} fontSize="13" fontWeight="600">
              Load unpacked
            </text>
            <Folder x={250} y={70} name="ulixdesk" files={["manifest.json"]} tone="good" />
            <text x="420" y="130" fill={deep} fontFamily={font} fontSize="13" fontWeight="600">
              Select this folder
            </text>
          </Browser>
        </Frame>
      );
    case "pin":
      return (
        <Frame label="The Chrome puzzle menu with UlixDesk Timer pinned.">
          <Browser url="chrome://extensions">
            <rect x="548" y="26" width="20" height="20" rx="4" fill={card} stroke={deep} />
            <rect x="552" y="30" width="5" height="5" rx="1" fill={accent} />
            <rect x="559" y="30" width="5" height="5" rx="1" fill={deep} />
            <rect x="552" y="37" width="5" height="5" rx="1" fill={blue} />
            <rect x="559" y="37" width="5" height="5" rx="1" fill={accent} />
            <rect x="300" y="70" width="280" height="110" rx="10" fill={card} stroke={line} />
            <rect x="312" y="86" width="256" height="36" rx="8" fill={wash} />
            <text x="328" y="109" fill={ink} fontFamily={font} fontSize="13" fontWeight="600">
              UlixDesk Timer
            </text>
            <path d="M530 96 v16" stroke={accent} strokeWidth="2" />
            <circle cx="530" cy="112" r="4" fill={accent} />
            <text x="328" y="154" fill={muted} fontFamily={font} fontSize="12">
              Pin it to the toolbar
            </text>
          </Browser>
        </Frame>
      );
    case "sign-in":
      return (
        <Frame label="The extension popup asking for the server URL, email, and password.">
          <rect x="180" y="24" width="280" height="176" rx="12" fill={card} stroke={line} />
          <text x="200" y="52" fill={ink} fontFamily={font} fontSize="16" fontWeight="700">
            Sign in
          </text>
          <text x="200" y="78" fill={muted} fontFamily={font} fontSize="11">
            Server URL
          </text>
          <rect x="200" y="84" width="240" height="22" rx="6" fill={wash} stroke={deep} />
          <text x="208" y="99" fill={ink} fontFamily={font} fontSize="11">
            https://desk.example.com
          </text>
          <text x="200" y="124" fill={muted} fontFamily={font} fontSize="11">
            Email and password
          </text>
          <rect x="200" y="130" width="240" height="18" rx="6" fill={page} stroke={line} />
          <rect x="200" y="154" width="240" height="18" rx="6" fill={page} stroke={line} />
        </Frame>
      );
    case "reload":
      return (
        <Frame label="The extension card on chrome://extensions with the Reload button.">
          <Browser url="chrome://extensions">
            <rect x="40" y="72" width="420" height="100" rx="10" fill={card} stroke={line} />
            <text x="56" y="100" fill={ink} fontFamily={font} fontSize="15" fontWeight="700">
              UlixDesk Timer
            </text>
            <text x="56" y="122" fill={muted} fontFamily={font} fontSize="12">
              Replace the folder, then reload
            </text>
            <rect x="300" y="132" width="140" height="28" rx="8" fill={deep} />
            <text x="338" y="151" fill={card} fontFamily={font} fontSize="13" fontWeight="600">
              Reload
            </text>
          </Browser>
        </Frame>
      );
    case "manifest":
      return (
        <Frame label="Chrome showing a manifest error until the folder that contains manifest.json is loaded.">
          <Browser url="chrome://extensions">
            <rect x="40" y="72" width="560" height="48" rx="8" fill={roseWash} stroke={rose} />
            <text x="56" y="102" fill={rose} fontFamily={font} fontSize="13" fontWeight="600">
              Manifest file is missing or unreadable
            </text>
            <text x="40" y="150" fill={ink} fontFamily={font} fontSize="13">
              Use the folder that contains manifest.json, then click Reload.
            </text>
          </Browser>
        </Frame>
      );
    case "folder":
      return (
        <Frame label="The zip file is the wrong choice. The folder containing manifest.json is the right choice.">
          <Folder x={48} y={48} name="Downloads" files={["extension.zip"]} tone="bad" />
          <text x="48" y="196" fill={rose} fontFamily={font} fontSize="12" fontWeight="600">
            Not the zip
          </text>
          <Folder x={360} y={48} name="ulixdesk" files={["manifest.json"]} tone="good" />
          <text x="360" y="196" fill={deep} fontFamily={font} fontSize="12" fontWeight="600">
            Folder with manifest.json
          </text>
        </Frame>
      );
    case "url":
      return (
        <Frame label="A server URL with a path is wrong. The origin, with no path, is right.">
          <rect x="36" y="40" width="568" height="64" rx="10" fill={roseWash} stroke={rose} />
          <text x="52" y="66" fill={rose} fontFamily={font} fontSize="12" fontWeight="600">
            Wrong
          </text>
          <text x="52" y="86" fill={ink} fontFamily={font} fontSize="13">
            https://desk.example.com/login
          </text>
          <rect x="36" y="120" width="568" height="64" rx="10" fill={wash} stroke={deep} />
          <text x="52" y="146" fill={deep} fontFamily={font} fontSize="12" fontWeight="600">
            Right
          </text>
          <text x="52" y="166" fill={ink} fontFamily={font} fontSize="13">
            https://desk.example.com
          </text>
        </Frame>
      );
    default:
      return null;
  }
}
