export const TOKEN_NAME_MAX = 80;

/** User-facing copy for extension access tokens and bearer auth. */
export const tokenCopy = {
  nameRequired: "Name is required.",
  nameTooLong: "Name must be 80 characters or fewer.",
  createFailed: "Something went wrong creating this token. Try again.",
  bearerRequired: "Send a Bearer access token.",
  tokenRejected: "That access token is invalid or has been revoked.",
  pageTitle: "Extension access",
  pageIntro:
    "Create an access token for the Chrome extension. UlixDesk stores only a hash of the token. The token itself is shown once, when you create it.",
  newToken: "New token",
  nameLabel: "Name",
  nameHint: "A label so you can tell tokens apart, such as Work laptop.",
  create: "Create token",
  creating: "Creating…",
  revealTitle: "Copy this token now",
  revealBody:
    "This is the only time UlixDesk shows this token. Paste it into the extension options. It can't be shown again.",
  copy: "Copy token",
  copied: "Copied",
  tokenLabel: "Access token",
  copyFailed: "Select the token and copy it.",
  listTitle: "Access tokens",
  emptyTitle: "No access tokens",
  emptyBody: "Create a token, then paste it into the Chrome extension options.",
  colName: "Name",
  colCreated: "Created",
  colLastUsed: "Last used",
  colStatus: "Status",
  notUsed: "Not used yet",
  active: "Active",
  revoked: "Revoked",
  revoke: "Revoke",
  revokeTitle: "Revoke this token?",
  revokeConfirm: "Revoke token",
  revoking: "Revoking…",
  cancel: "Cancel",
} as const;

export function revokeTokenBody(name: string) {
  return `The Chrome extension using “${name}” will stop working. This can't be undone.`;
}

export function formatTokenTimestamp(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}
