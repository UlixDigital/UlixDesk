# UlixDesk Chrome extension

The extension is Manifest V3. It is not in the Chrome Web Store. Load the unpacked build, then sign in from the popup.

## Install

From the repository root:

```bash
npm run build:extension
```

That writes `extension/dist`. The zip next to it is not required for a local install. Neither is committed.

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Choose **Load unpacked** and select the `extension/dist` folder.

The unpacked id is `cjlaoflbipaehclleojofopapalhiooe`. The server must list that id in `ULIXDESK_EXTENSION_IDS`. Local `.env` already does.

## Sign in

1. Click the UlixDesk toolbar button.
2. The server is `https://desk.ulixdigital.com`. Choose **Use staging** for the rehearsal site, or **Custom server** for another origin.
3. Enter the UlixDesk email and password and choose **Sign in**.
4. When Chrome asks, allow the extension to reach that server. It asks only for that origin.
5. The popup shows the name and email. **Sign out** revokes the sign-in on the server.

The password is not saved. This browser keeps the server URL, a 15-minute access token, a refresh token, and the name and email in `chrome.storage.local`.

## Point it at a local server

1. In another terminal, from the repository root: `npm run db:up`, then `npx prisma migrate deploy`, then `npm run user:bootstrap`, then `npm run dev`.
2. Open the extension popup.
3. Choose **Custom server**.
4. Enter `http://127.0.0.1:3000` (no path).
5. Sign in with the bootstrap email and password from `.env` (`owner@ulix.local` / `local-owner-password` unless you changed them).
6. Allow Chrome to reach `http://127.0.0.1:3000`.

`npm run dev` listens on `127.0.0.1` only. Use that host, not a LAN address, unless the app is actually listening there.

To rehearse against staging instead, choose **Use staging**. That origin is `https://staging.desk.ulixdigital.com`.

## Access token fallback

Extension access, on the website, can still create an access token. Open the extension options (right-click the toolbar button, then Options), paste the server URL and the token, then choose Save, Grant permission, and Test connection. That replaces a popup sign-in on this browser.
