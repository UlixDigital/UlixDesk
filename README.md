# UlixDesk

UlixDesk is Ulix Digital's internal time-tracking app. The product follows the same shape as Hubstaff: a directory of clients, then projects, then time tracked against that work.

This repository contains **Slice 1: Clients**, **Slice 2: Projects**, **Slice 3: Timesheets**, and **Slice 4: the Chrome extension timer**. The team can keep a directory of clients and projects, track time in the app, and start or stop the same timer from Chrome.

There is no login yet. The Chrome extension authenticates with an access token created on the Extension access page. That token is not a user account. The app is an internal MVP backed by a local database.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS 4
- Prisma 6 + SQLite for local development

## Run locally

From the repository root:

```bash
npm install
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The home page redirects to [http://localhost:3000/clients](http://localhost:3000/clients). Projects live at [http://localhost:3000/projects](http://localhost:3000/projects). Timesheets live at [http://localhost:3000/timesheets](http://localhost:3000/timesheets). Extension access tokens live at [http://localhost:3000/settings](http://localhost:3000/settings).

`npm install` generates the Prisma client. `npx prisma migrate deploy` creates the local SQLite database at `prisma/dev.db` and applies every migration, including the Slice 3 time-entry migration (`20261009150000_time_entries`). That file is gitignored.

If you already have a Slice 1 or Slice 2 database, run `npx prisma migrate deploy` again before starting the app. That adds the `TimeEntry` and `RunningTimer` tables. It does not delete clients or projects.

`.env` only contains:

```bash
DATABASE_URL="file:./dev.db"
```

That value is a local file path, not a credential. Do not point this app at a production database.

To wipe local data and reapply migrations:

```bash
npx prisma migrate reset --force
```

## Checks

```bash
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` runs the Vitest unit tests against `prisma/test.db`. `npm run test:e2e` runs Playwright in Chromium. It covers failed saves on Add time and Add project, the header timer after start, stop, and an archived project, a submit before JavaScript, and the unpacked Chrome extension. Playwright starts its own `npm run dev` on [http://127.0.0.1:3100](http://127.0.0.1:3100) and does not reuse a server that is already running. That server uses `DATABASE_URL=file:./e2e.db` (`prisma/e2e.db`), which the run deletes and migrates before Next starts. It does not read or write `prisma/dev.db`, so it cannot stop a timer you started with `npm run dev`. The extension test loads the unpacked build in headed Chromium. Chrome's permission dialog is outside the page, so that test needs a display plus `xdotool` and `ffmpeg` to click Allow.

## What shipped in Slice 1

- Create a client. Name is required. Address, phone, and emails are optional.
- Edit those fields.
- Archive and restore, with Active and Archived tabs. Archive keeps the row and sets `archivedAt`. The UI has no delete control.
- Search by name within the current tab. Tab counts stay the unfiltered totals.
- Empty states for no clients, no active clients while archives exist, no archived clients, and no search matches.
- Server-side validation, including a required name.

Emails are stored in a related table because SQLite does not support Prisma scalar lists. The form edits them as chips.

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

Connect it:

1. In the app, open Settings and create a token on Extension access. Copy the token. UlixDesk shows it once and stores only a hash.
2. Open the extension options (right-click the toolbar button, then Options).
3. Enter the server URL, for example `http://127.0.0.1:3000`, and paste the token.
4. Choose Save.
5. Choose Grant permission and allow that server. The extension requests only that origin.
6. Choose Test connection. A success says the token can read projects.

The token is stored in `chrome.storage.local` on that computer. It is not stored in Chrome sync, and the extension does not write it to the console.

## Extension API

`GET /api/projects`, `GET /api/timer`, `POST /api/timer/start`, and `POST /api/timer/stop` accept `Authorization: Bearer <token>`. Responses are JSON. Times are UTC ISO-8601 strings. Successful and error responses send `Cache-Control: no-store`.

A valid token skips the origin and host checks. The extension can call the API from `chrome-extension://<id>`. An `Authorization` header that is not a bearer token gets `401` `{ "error": "Send a Bearer access token." }`. An unknown or revoked token gets `401` `{ "error": "That access token is invalid or has been revoked." }` and does not fall through to the same-origin rules. A bad token does not update last used. A valid token updates last used.

Requests with no `Authorization` header keep the same-origin rules. `POST /api/timer/start` and `POST /api/timer/stop` require `Content-Type: application/json` (`415` `{ "error": "Content-Type must be application/json." }` otherwise), including when a token is sent. A request with an `Origin` header is accepted when that origin is this app. `localhost`, `127.0.0.1`, and `::1` on that same port count as the same origin, so a call through `http://127.0.0.1:3000` is accepted when the app is also on port 3000. Node reports an IPv6 hostname as `[::1]`; that bracketed form is treated as `::1`. Any other origin gets `403` `{ "error": "This origin can't control the timer." }`. Requests with no `Origin` header are still accepted, which covers local tools.

The host is trusted only when it is loopback or listed in `ULIXDESK_APP_HOSTS` (comma-separated host, host:port, or origin values, for example `desk.example.com,https://staging.example.com`). An arbitrary `Host` is rejected with `403` `{ "error": "This host isn't allowed to control the timer." }` even if `Origin` matches that host. That closes the DNS-rebinding hole where a page could point a public name at this server and send a matching Host and Origin. A bearer token still skips that check, which is how the extension calls a configured server. `ULIXDESK_TIMER_ORIGINS` remains an extra origin allowlist for callers that do not send a token.

These four routes, and only these routes, answer CORS for `chrome-extension://` origins. `OPTIONS` returns `204` with `Access-Control-Allow-Origin` set to that exact origin, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, and `Access-Control-Allow-Headers: Authorization, Content-Type`. Other origins, including `https://` websites, get `403` and no CORS headers. Actual responses echo the extension origin the same way, including on `401` and `403`, so the extension can read the error. CORS is not opened to arbitrary web origins.

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
- `400` `{ "error": "Choose a project." }` when `projectId` is blank
- `400` `{ "error": "Choose an active project." }` when the project is archived
- `404` `{ "error": "That project no longer exists." }` when the project id is unknown
- `400` `{ "error": "Note must be 2000 characters or fewer." }`
- `400` `{ "error": "Send a JSON body with a project id." }` when the body is not a JSON object with a string `projectId`
- `409` `{ "error": "A timer is already running. Stop it before starting another.", "timer": { ... } }`

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

- `404` `{ "error": "No timer is running." }`
- `409` `{ "error": "Let the timer run for at least a second before stopping." }`

## What shipped in Slice 4

- Extension access tokens. Settings creates a named token, shows the plaintext once, and stores a SHA-256 hash. The list shows name, created, last used, and Active or Revoked. Revoke keeps the row and stops the token.
- Bearer auth on the timer API and `GET /api/projects`, plus CORS for `chrome-extension://` origins. Unauthenticated calls still follow the same-origin rules, and an untrusted Host is rejected.
- A Chrome extension popup: project picker, optional note, Start and Stop, live elapsed time, and the running project and client. It shows a timer started in the web app and can stop it. The toolbar badge shows a dot under one minute and elapsed minutes after that. Opening the popup refreshes the badge, and `chrome.alarms` checks about once a minute.
- Options for the server URL and token, Grant permission for that origin, and Test connection. The last chosen project is remembered. Host access is an optional permission requested for the saved origin only. There is no `<all_urls>` permission.

A click on Add client, Add project, Add time, or the header timer before hydration posts the server action. An archived project id in the header is cleared after the notice is shown, so a reload does not repeat “That project is no longer active. Choose another project.”

## Deferred

- User accounts and login beyond extension access tokens
- Chrome Web Store publishing
- Screenshots, activity, and idle tracking
- Approvals and reasons
- Reporting beyond the daily and weekly timesheets
- Members, roles, and people admin
- Pay rates, bill rates, budgets, and to-dos
- Import, duplicate, and transfer
- Invoicing, auto-invoicing, invoice notes, tax, and net terms
- Production deployment
