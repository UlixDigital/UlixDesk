/** Exact UI copy for the extension. Tests and the popup share these strings. */

export const popupCopy = {
  notConnectedTitle: "Not connected",
  notConnectedBody:
    "Add the UlixDesk server URL and an access token in extension options.",
  openOptions: "Open options",
  unreachableTitle: "Can't reach the server",
  unreachableBody: "Check the server URL and that UlixDesk is running, then try again.",
  tryAgain: "Try again",
  unauthorizedTitle: "Access token isn't valid",
  unauthorizedBody:
    "This token was rejected. Create a new one on the Extension access page, then update the extension options.",
  permissionTitle: "Permission needed",
  permissionBody:
    "Chrome needs permission to talk to this server. Grant it on the options page, then try again.",
  invalidUrlTitle: "Server URL isn't valid",
  invalidUrlBody: "Enter a server URL that starts with http:// or https:// in extension options.",
  noProjectsTitle: "No active projects",
  noProjectsBody: "Add an active project in UlixDesk before tracking time.",
  unexpectedTitle: "Unexpected response",
  unexpectedBody:
    "The server returned an unexpected response. Check that the server URL points at UlixDesk.",
  loading: "Checking the timer…",
  idle: "No timer running",
  chooseProject: "Choose a project to start the timer.",
  projectGone: "That project is no longer active. Choose another project.",
  alreadyRunning: "A timer is already running.",
  timerRunning: "Timer running",
  projectLabel: "Project",
  projectPlaceholder: "Project",
  noteLabel: "Note",
  noteOptional: "Optional",
  notePlaceholder: "What are you working on?",
  start: "Start",
  starting: "Starting…",
  stop: "Stop",
  stopping: "Stopping…",
  elapsedLabel: "Elapsed time",
} as const;

export const optionsCopy = {
  title: "UlixDesk options",
  heading: "Connect to UlixDesk",
  intro:
    "Enter the server URL and an access token from the Extension access page. The token stays in this browser, in local storage.",
  serverUrl: "Server URL",
  serverUrlHint: "Use http:// or https://, for example http://127.0.0.1:3000.",
  serverUrlPlaceholder: "http://127.0.0.1:3000",
  token: "Access token",
  tokenHint: "Shown once when you create it in UlixDesk. It is stored only on this computer.",
  save: "Save",
  grant: "Grant permission",
  test: "Test connection",
  testing: "Testing…",
  saved: "Saved. Grant permission for this server, then test the connection.",
  missingFields: "Enter a server URL and an access token first.",
  invalidUrl: "Enter a server URL that starts with http:// or https://.",
  granted: "Chrome can reach this server.",
  grantDenied: "Permission was not granted. The extension can't reach that server until you allow it.",
  needPermission:
    "Chrome needs permission to talk to that server. Choose Grant permission, then test again.",
  connected: "Connected. The token can read projects from this server.",
  unreachable: "Can't reach that server. Check the URL and that UlixDesk is running.",
  tokenRejected: "That access token was rejected. It may be invalid or revoked.",
  unexpected: "The server returned an unexpected response.",
  serverError: "The server returned an error:",
} as const;
