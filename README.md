# UlixDesk

UlixDesk is Ulix Digital's internal time-tracking app. The product follows the same shape as Hubstaff: a directory of clients, then projects, then time tracked against that work.

This repository contains **Slice 1: Clients**, **Slice 2: Projects**, **Slice 3: Timesheets**, **Slice 4: the Chrome extension timer**, and **Slice 5: go-live foundations** (staff login, PostgreSQL, and the staging/production stack). Staff sign in with an email and a password. There is no public signup and no client login.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Node.js 22.5 or newer (`engines` and `.nvmrc`)
- Tailwind CSS 4
- Prisma 6 + PostgreSQL 16

## Run locally

From the repository root, with Docker available:

```bash
npm install
cp .env.example .env
npm run db:up
npx prisma migrate deploy
npm run user:bootstrap
npm run dev
```

`npm run db:up` starts Postgres from `docker-compose.yml` and publishes it on `127.0.0.1:5432` only. The first start also creates `ulixdesk_test` and `ulixdesk_e2e`, so unit tests and Playwright do not use the dev database.

`npm run dev` listens on `127.0.0.1` only. Open [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login). Copy `.env.example` to `.env` (`.env` is not committed). The local bootstrap owner is `owner@ulix.local` / `local-owner-password`. Those are local defaults, not production secrets. After sign-in, change that password under Extension access, then remove `ULIXDESK_BOOTSTRAP_PASSWORD` from `.env` if this database will keep being used. Clients are at [http://127.0.0.1:3000/clients](http://127.0.0.1:3000/clients), projects at `/projects`, timesheets at `/timesheets`, extension tokens and the password form at `/settings`, and the team page at `/team` for owners and admins.

A new database starts empty. To copy a Phase 1 SQLite file after the owner exists, see [docs/DEPLOY.md](docs/DEPLOY.md). `npm run import:sqlite -- --from <path> --dry-run` prints counts and writes nothing.

`npm run user:bootstrap` creates that owner only when the database has no users. It does not print the password. See [docs/DEPLOY.md](docs/DEPLOY.md) for staging, production, and a local run of the full Caddy stack.

To wipe the dev database and reapply migrations:

```bash
npx prisma migrate reset --force
npm run user:bootstrap
```

## Checks

```bash
npm test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` runs Vitest against `ulixdesk_test`. `npm run typecheck` checks the app and the extension. `npm run test:e2e` runs Playwright in Chromium against `ulixdesk_e2e` on [http://127.0.0.1:3100](http://127.0.0.1:3100). It resets that database, creates the e2e owner (`owner@ulix.test` / `e2e-password-10`), and does not reuse a server that is already running. It does not read the dev database. The extension test loads the unpacked build in headed Chromium and is skipped when `CI` is set. Chrome's permission dialog is outside the page, so that test needs a display plus `xdotool` and `ffmpeg` to click Allow.

## What shipped in Slice 1

- Create a client. Name is required. Address, phone, and emails are optional.
- Edit those fields.
- Archive and restore, with Active and Archived tabs. Archive keeps the row and sets `archivedAt`. The UI has no delete control.
- Search by name within the current tab. Tab counts stay the unfiltered totals.
- Empty states for no clients, no active clients while archives exist, no archived clients, and no search matches.
- Server-side validation, including a required name.

Emails are stored in a related table. The form edits them as chips.

## What shipped in Slice 2

- Create and edit a project. Name is required. Description is optional. Billable defaults to on.
- Optionally link one client. The picker lists active clients only. A project keeps its link if that client is archived later, and the list and the form show an Archived badge. Changing the client still cannot pick an archived client.
- Archive and restore, with Active and Archived tabs and the same confirmation as clients. The UI has no delete control.
- Search by project name and filter by client. Tab counts stay the unfiltered Active and Archived totals, and the count text uses the same pluralization helper as clients.
- A client's edit page lists that client's projects, with a link to each one.

## What shipped in Slice 3

- Manual time entries. Project is required, and new entries can only use an active project. Billable starts from the project's billable setting and can be changed for that entry. Note is optional. Line breaks in a note are stored as LF, so a 2000-character note can include Windows line breaks.
- When To is earlier than From, the entry ends at that time on the next day. A short roll says “Ends the next day.” A roll longer than 12 hours warns beside the duration, for example “This entry is 23h long and ends the next day. Check the times.” The hours in that sentence are the real duration. Saving is still allowed. Equal From and To, with no later end date, is rejected with “End time must be after the start time.” A deliberate 24-hour entry uses an explicit end date, such as 09:00 through 09:00 the next day. An explicit end date on an existing entry is kept. The end still cannot be in the future, including an overnight end that has not happened yet, and an entry still cannot be longer than 24 hours. A fall-back day can cross that limit as a same-day range, as a rolled To that is earlier than From, or as an explicit next midnight. A local time that does not exist during spring forward is rejected, including when the rolled end lands in the gap. A failed save keeps the project, client, times, note, and billable values on the form. The project and client selects stay on the chosen option, including after a failed create.
- Overlapping entries show a warning and are still saved.
- A header timer. The running entry is stored on the server, so a reload keeps it. Only one timer can run. The project chosen in the header stays selected after start and stop. If that project is archived, the select clears and says “That project is no longer active. Choose another project.” Stopping saves a timer-sourced entry. Stopping in under a second leaves the timer running. A timer that runs longer than 24 hours is saved as exactly 24 hours from the start; the extra time is discarded. The header clock and the daily Running row share one timer.
- Daily and weekly timesheets. The week is Monday through Sunday. Both views filter by project and client, and totals follow those filters. Completed time that crosses local midnight is split across the two days. Those days say “Continues into the next day” and “Continues from the previous day.” The daily view also lists a running timer, with a “Running” badge, a live elapsed time, and an Open link to that entry. The running row stays out of the entry count and the duration total. The weekly view stays completed time only. Edit any completed entry. Delete is permanent, after a confirmation. Deleting the running timer leaves it running and says “Stop the timer before deleting this entry.”
- Times display in the browser's timezone and are stored in UTC. The browser writes that timezone into the `ulixdesk-timezone` cookie before the timesheet renders dates, so the server and the browser format the same zone.
- Project and client edit pages show completed tracked time. A running timer is not included until it is stopped. Time stays on the project, so it follows the project if the client link changes.
- `TimeEntry.userId` is null for every row today. `RunningTimer.id` is `"workspace"`. Adding accounts later means filling `userId` and using the user's id as the timer row id. The start, end, and duration columns stay as they are.

A timer can still cross midnight. Editing an entry whose end is on another date shows that end date.

## Chrome extension

The extension is Manifest V3 and lives in `extension/`. It talks to whatever server URL you save (http or https), so the same build can point at localhost today and at dev, staging, or prod later. It is not published to the Chrome Web Store.

Build the unpacked folder and the zip:

```bash
npm run build:extension
```

That writes `extension/dist` and `extension/ulixdesk-extension.zip`. Neither is committed.

Load it in Chrome:

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Choose Load unpacked and select the `extension/dist` folder.

Sign in:

1. Click the toolbar button.
2. The server defaults to `https://desk.ulixdigital.com`. Choose **Use staging** for `https://staging.desk.ulixdigital.com`, or **Custom server** and enter an origin such as `http://127.0.0.1:3000`.
3. Enter the UlixDesk email and password, then choose **Sign in**.
4. Chrome asks for permission to talk to that server. Choose Allow. The extension requests only that origin.
5. The popup shows the person's name and email. **Sign out** revokes that sign-in.

The password is not stored. `chrome.storage.local` keeps the server URL, a short-lived access token, a refresh token, when the access token expires, and the name and email. It is not stored in Chrome sync, and the extension does not write it to the console.

To point a local build at your machine, choose **Custom server** and use `http://127.0.0.1:3000` (or the port `npm run dev` is using). See [extension/README.md](extension/README.md).

An access token is still available under Extension access, as an advanced fallback. Open the extension options, paste the token, choose Save, Grant permission, and Test connection. Saving a token there replaces a popup sign-in on that browser.

The unpacked manifest includes a public `key`, so Chrome assigns the same extension id on every computer: `cjlaoflbipaehclleojofopapalhiooe`. That id is already in `.env` as `ULIXDESK_EXTENSION_IDS`. To confirm it, open `chrome://extensions`, turn on Developer mode, and read the ID under the extension name. For any other build, put that id in `ULIXDESK_EXTENSION_IDS` (comma-separated if more than one).

The public key is not a secret. It only keeps the unpacked id stable, so one `ULIXDESK_EXTENSION_IDS` value works everywhere. CORS still requires a valid access token. Someone who copies the public key into another unpacked extension can pass the CORS check, and still cannot authenticate without a token. Do not commit a private key. A later Chrome Web Store publish needs its own private key, kept out of this repo. That store id will be different, and it has to be added to `ULIXDESK_EXTENSION_IDS`.

## Extension API

`GET /api/projects`, `GET /api/timer`, `POST /api/timer/start`, and `POST /api/timer/stop` accept `Authorization: Bearer <token>`. Responses are JSON. Times are UTC ISO-8601 strings. Successful and error responses send `Cache-Control: no-store`.

A valid token skips the origin and host checks. The extension can call the API from `chrome-extension://<id>` when that id is listed in `ULIXDESK_EXTENSION_IDS`. An `Authorization` header that is not a bearer token gets `401` `{ "error": "Send a Bearer access token.", "code": "BEARER_REQUIRED" }`. An unknown or revoked token gets `401` `{ "error": "That access token is invalid or has been revoked.", "code": "TOKEN_INVALID" }` and does not fall through to the same-origin rules. A bad token does not update last used. A valid token updates last used, and at most once a minute.

Requests with no `Authorization` header keep the same-origin rules. `POST /api/timer/start` and `POST /api/timer/stop` require `Content-Type: application/json` (`415` `{ "error": "Content-Type must be application/json.", "code": "UNSUPPORTED_MEDIA_TYPE" }` otherwise), including when a token is sent. A request with an `Origin` header is accepted when that origin is this app. `localhost`, `127.0.0.1`, and `::1` on that same port count as the same origin, so a call through `http://127.0.0.1:3000` is accepted when the app is also on port 3000. Node reports an IPv6 hostname as `[::1]`; that bracketed form is treated as `::1`. Any other origin gets `403` `{ "error": "This origin can't control the timer.", "code": "ORIGIN_FORBIDDEN" }`. Requests with no `Origin` header are still accepted, which covers local tools.

The host is trusted only when it is loopback (`localhost`, `127.0.0.1`, `::1`) or listed in `ULIXDESK_APP_HOSTS` (comma-separated host, host:port, or origin values, for example `desk.example.com,https://staging.example.com`). The same allowlist is applied by `src/middleware.ts` to every page, server action, and API route. An arbitrary `Host` is rejected with `403` and `"code": "HOST_FORBIDDEN"` even if `Origin` matches that host. Pages, server actions, and every other route, including `GET /api/projects`, return `{ "error": "This host isn't allowed to access UlixDesk.", "code": "HOST_FORBIDDEN" }`. `GET /api/timer`, `POST /api/timer/start`, and `POST /api/timer/stop` return `{ "error": "This host isn't allowed to control the timer.", "code": "HOST_FORBIDDEN" }`. That closes the DNS-rebinding hole where a page could point a public name at this server and send a matching Host and Origin, then call the create-token action and read the plaintext token. A request that sends `Authorization: Bearer <token>` to `GET /api/projects`, `GET /api/timer`, `POST /api/timer/start`, or `POST /api/timer/stop` is the only exception: middleware lets it through from any host, and the route still returns `401` for a bad token. `ULIXDESK_TIMER_ORIGINS` remains an extra origin allowlist for callers that do not send a token.

On OVH, set `ULIXDESK_APP_HOSTS` to each environment's public hostname before the process starts. Production might be `desk.example.com` and staging `staging.example.com`. Without that variable, the site answers only on loopback.

`GET /api/projects`, `GET /api/timer`, `POST /api/timer/start`, `POST /api/timer/stop`, `GET /api/extension/session`, `POST /api/extension/session`, `POST /api/extension/session/refresh`, and `POST /api/extension/session/revoke` answer CORS for chrome-extension origins whose id is in `ULIXDESK_EXTENSION_IDS`. Only these routes do. `OPTIONS` returns `204` with `Access-Control-Allow-Origin` set to that exact origin, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, and `Access-Control-Allow-Headers: Authorization, Content-Type`. Other origins, including other `chrome-extension://` ids and `https://` websites, get `403` and no CORS headers. Actual responses echo an allowlisted extension origin the same way, including on `401` and `403`, so the extension can read the error. CORS is not opened to arbitrary web origins. Error JSON keeps the human `error` string and adds a `code`.

### `GET /api/projects`

Active projects for the picker, sorted by name.

```json
{
  "projects": [
    {
      "id": "clx",
      "name": "Website",
      "billable": true,
      "client": { "id": "cly", "name": "Acme" }
    }
  ]
}
```

`client` is `null` when the project has no client. Archived projects are omitted.

### `GET /api/timer`

The running timer, or `{ "timer": null }`.

```json
{
  "timer": {
    "id": "clz",
    "projectId": "clx",
    "projectName": "Website",
    "clientName": "Acme",
    "startedAt": "2026-10-09T15:00:00.000Z",
    "billable": true,
    "note": null,
    "source": "timer"
  }
}
```

`clientName` is `null` when the project has no client. Billable is copied from the project when the timer starts.

### `POST /api/timer/start`

```json
{ "projectId": "clx", "note": "optional" }
```

- `201` `{ "timer": { ...same shape as GET /api/timer } }`
- `400` `{ "error": "Choose a project.", "code": "PROJECT_REQUIRED" }` when `projectId` is blank
- `400` `{ "error": "Choose an active project.", "code": "PROJECT_ARCHIVED" }` when the project is archived
- `404` `{ "error": "That project no longer exists.", "code": "PROJECT_NOT_FOUND" }` when the project id is unknown
- `400` `{ "error": "Note must be 2000 characters or fewer.", "code": "NOTE_TOO_LONG" }`
- `400` `{ "error": "Send a JSON body with a project id.", "code": "INVALID_JSON" }` when the body is not a JSON object with a string `projectId`
- `409` `{ "error": "A timer is already running. Stop it before starting another.", "code": "ALREADY_RUNNING", "timer": { ... } }`
- `415` `{ "error": "Content-Type must be application/json.", "code": "UNSUPPORTED_MEDIA_TYPE" }`
- `403` `{ "error": "This origin can't control the timer.", "code": "ORIGIN_FORBIDDEN" }`
- `403` `{ "error": "This host isn't allowed to control the timer.", "code": "HOST_FORBIDDEN" }`

### `POST /api/timer/stop`

No JSON fields. Send `Content-Type: application/json`. The same origin rule as start applies.

- `200`

```json
{
  "entry": {
    "id": "clz",
    "projectId": "clx",
    "projectName": "Website",
    "clientName": null,
    "startedAt": "2026-10-09T15:00:00.000Z",
    "endedAt": "2026-10-09T16:00:00.000Z",
    "durationMs": 3600000,
    "billable": true,
    "note": null,
    "source": "timer",
    "capped": false
  },
  "warnings": []
}
```

`warnings` can include `This timer ran longer than 24 hours, so the saved entry was capped at 24 hours.` and `This time overlaps another entry. You can still save it.` `capped` is true when the saved end is exactly 24 hours after the start.

- `404` `{ "error": "No timer is running.", "code": "NOT_RUNNING" }`
- `409` `{ "error": "Let the timer run for at least a second before stopping.", "code": "TOO_SHORT" }`

### Extension sign-in

`POST /api/extension/session` checks the email and password with the same Argon2id verifier and the same rate limit as the web sign-in form. The caller must be an allowlisted `chrome-extension://` origin. A trusted host is still required. There is no session cookie.

```json
{ "email": "owner@ulix.local", "password": "••••••••••" }
```

- `201` `{ "accessToken", "refreshToken", "accessExpiresAt", "refreshExpiresAt", "user": { "name", "email" } }`
- `400` `{ "error": "Enter your email.", "code": "EMAIL_REQUIRED" }`
- `400` `{ "error": "Enter a valid email.", "code": "EMAIL_INVALID" }`
- `400` `{ "error": "Enter your password.", "code": "PASSWORD_REQUIRED" }`
- `400` `{ "error": "The request body is not valid JSON.", "code": "INVALID_JSON" }`
- `401` `{ "error": "That email or password is incorrect.", "code": "INVALID_LOGIN" }`
- `403` `{ "error": "This account is deactivated. Ask an owner to restore it.", "code": "ACCOUNT_DEACTIVATED" }`
- `429` `{ "error": "Too many sign-in attempts. Wait 15 minutes and try again.", "code": "RATE_LIMITED" }`
- `415` `{ "error": "Content-Type must be application/json.", "code": "UNSUPPORTED_MEDIA_TYPE" }`
- `403` `{ "error": "This origin isn't allowed to access UlixDesk.", "code": "ORIGIN_FORBIDDEN" }`
- `403` `{ "error": "This host isn't allowed to access UlixDesk.", "code": "HOST_FORBIDDEN" }`

The access token lasts 15 minutes and is sent as `Authorization: Bearer` on the timer routes. The refresh token lasts 30 days from sign-in and does not get longer when it is used. `POST /api/extension/session/refresh` with `{ "refreshToken" }` returns a new pair and retires the old refresh token. Using the previous refresh token again, after 60 seconds, revokes that sign-in (`401` `{ "error": "This sign-in was used somewhere else, so it was revoked. Sign in again.", "code": "REFRESH_REUSED" }`). An unknown, expired, or revoked refresh token is `401` `{ "error": "This sign-in is no longer valid. Sign in again.", "code": "REFRESH_INVALID" }`. A missing refresh token uses that same code with `{ "error": "Send the refresh token." }`.

`POST /api/extension/session/revoke` with `{ "refreshToken" }` signs that browser out. `GET /api/extension/session` with the access token returns `{ "user": { "name", "email" } }`.

Changing the password revokes every extension sign-in and every manual access token, and signs out the person's other web browsers. The browser that changed the password stays signed in. Deactivating the account does the same. Setting a password from a set-password link revokes extension sign-ins and access tokens too.

## What shipped in Slice 4

- Extension access tokens. Settings creates a named token, shows the plaintext once, and stores a SHA-256 hash. The list shows name, created, last used, and Active or Revoked. Revoke keeps the row and stops the token.
- Bearer auth on the timer API and `GET /api/projects`, plus CORS for `chrome-extension://` origins. An untrusted Host is rejected. Slice 5 ties each token to a user. A call with no bearer token needs a session cookie after the same origin checks.
- A Chrome extension popup: project picker, optional note, Start and Stop, live elapsed time, and the running project and client. After this popup starts the timer, the status line says “Timer running”. Opening the popup while a timer is already running, including one started in the web app, says “A timer is already running.” If the last chosen project is archived and no active projects remain, the popup says “No active projects”. The toolbar badge shows a dot under one minute and elapsed minutes after that. Opening the popup refreshes the badge, and `chrome.alarms` checks about once a minute. The access token stays in `chrome.storage.local` on that computer.
- Options for the server URL and token, Grant permission for that origin, and Test connection. The last chosen project is remembered. Host access is an optional permission requested for the saved origin only. There is no `<all_urls>` permission.

A click on Add client, Add project, Add time, or the header timer before hydration posts the server action. An archived project id in the header is cleared after the notice is shown, so a reload does not repeat “That project is no longer active. Choose another project.”

## What shipped in Slice 5

- Staff login with Argon2id passwords, server-side sessions, logout, and login rate limits. Owners and admins manage clients, projects, and the team. Members track their own time. Each person has their own running timer.
- Team page: add a person, copy a one-time set-password link, reset that link, change a role, and deactivate or restore. UlixDesk does not send email.
- Extension tokens belong to the signed-in user. PostgreSQL replaces SQLite. The production image, Caddy, backups, and GitHub workflows are described in [docs/DEPLOY.md](docs/DEPLOY.md).
- The extension popup says “That project no longer exists. Choose another project.” when the server returns `PROJECT_NOT_FOUND`. `GET /api/projects` says “This origin isn't allowed to access UlixDesk.” for a forbidden origin. Invalid JSON on timer start uses the `INVALID_JSON` code. `http://[::1]:3000` counts as the same origin as the other loopback names on that port.

## What shipped in Slice 6

- The extension popup signs in with an email and password. The server defaults to production, with Use staging and a custom server for a local or staging origin. Chrome's optional host permission is requested from the Sign in click.
- Each sign-in is a hashed access token (15 minutes) plus a rotating refresh token (30 days). Sign out, a password change, and deactivation revoke it. Extension access lists the device, when it was created, and when it was last used, and can revoke one.
- Access tokens stay on that page as an advanced fallback. Changing the password revokes them, the same as extension sign-ins.
- Stopping a timer before one second returns `TOO_SHORT`. Expired and idle web sessions are removed with `deleteMany`. A wrong current password is rate-limited, and a password change signs out the other web sessions.

## What shipped in Slice 7

- Ulix logo in the sidebar, on sign-in and set-password, and in the extension popup. The favicon and the extension icons use the mark.
- Primary buttons use a darkened blue so white text stays at least 4.5:1. Deep indigo is the hover, active, and focus colour.
- After Chrome grants host access, a failed token refresh shows that error and Try again, instead of staying on Permission needed.
- A password change revokes manual access tokens as well as extension sign-ins.
- The lockfile records the Node.js engine, so `npm install` does not rewrite it.

## Deferred

- Chrome Web Store publishing
- Screenshots, activity, and idle tracking
- Approvals and reasons
- Reporting beyond the daily and weekly timesheets
- Pay rates, bill rates, budgets, and to-dos
- Import, duplicate, and transfer
- Invoicing, auto-invoicing, invoice notes, tax, and net terms
- Email delivery for invites
- Client logins, public signup, and SSO
