/** User-facing copy for extension sign-ins. Login errors stay in authCopy. */
export const extensionSessionCopy = {
  refreshInvalid: "This sign-in is no longer valid. Sign in again.",
  refreshReused: "This sign-in was used somewhere else, so it was revoked. Sign in again.",
  refreshRequired: "Send the refresh token.",
  sessionsTitle: "Extension sign-ins",
  sessionsIntro:
    "Each Chrome extension that signed in with your email is listed here. Revoke one to sign that browser out.",
  emptyTitle: "No extension sign-ins",
  emptyBody: "Open the Chrome extension and sign in with your email and password.",
  colDevice: "Device",
  revokeTitle: "Revoke this sign-in?",
  revokeConfirm: "Revoke sign-in",
  advancedTitle: "Advanced: access tokens",
  advancedIntro:
    "Create an access token only if you need to paste one into the extension options. UlixDesk stores only a hash. The token itself is shown once. Changing your password revokes these tokens.",
} as const;

export function revokeSessionBody(label: string) {
  return `The Chrome extension on “${label}” will be signed out. This can't be undone.`;
}
