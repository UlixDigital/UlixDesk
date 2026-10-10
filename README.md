# UlixDesk

UlixDesk is Ulix Digital's internal time-tracking app. The product follows the same shape as Hubstaff: a directory of clients, then projects, then time tracked against that work.

This repository contains **Slice 1: Clients**, **Slice 2: Projects**, and **Slice 3: Timesheets**. The team can keep a directory of clients and projects, then track time against active projects with a manual entry or a timer in the app header.

There is no login yet. Authentication comes later. The app is an internal MVP backed by a local database.

The next time-tracking client is a Chrome extension, not a desktop app. The extension itself is not in this slice. The JSON API it will call is.

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

Open [http://localhost:3000](http://localhost:3000). The home page redirects to [http://localhost:3000/clients](http://localhost:3000/clients). Projects live at [http://localhost:3000/projects](http://localhost:3000/projects). Timesheets live at [http://localhost:3000/timesheets](http://localhost:3000/timesheets).

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

`npm test` runs the Vitest unit tests. `npm run test:e2e` runs Playwright in Chromium against the app. It covers failed saves on Add time and Add project, and the header timer after start, stop, and an archived project. Playwright starts `npm run dev` on port 3000 when that port is free, and reuses a server that is already running. The e2e run uses the local SQLite database from `.env`.

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

## Extension API

No authentication yet. The Chrome extension should call these from its service worker. Responses are JSON. Times are UTC ISO-8601 strings.

`POST /api/timer/start` and `POST /api/timer/stop` require `Content-Type: application/json` (`415` `{ "error": "Content-Type must be application/json." }` otherwise). A request with an `Origin` header is accepted when that origin is the app's own origin. The app origin is `request.url` and the `Host` header. `localhost`, `127.0.0.1`, and `::1` on that same port count as the same origin, so a call through `http://127.0.0.1:3000` is accepted when the app is also on port 3000. Node reports an IPv6 hostname as `[::1]`; that bracketed form is treated as `::1`. Any other origin gets `403` `{ "error": "This origin can't control the timer." }`. Requests with no `Origin` header are still accepted, which covers the extension service worker and local tools. To allow the extension's origin later, add it to `TIMER_API_ORIGIN_ALLOWLIST` in `src/lib/timer-api-guard.ts`, or set `ULIXDESK_TIMER_ORIGINS` to a comma-separated list such as `chrome-extension://<extension-id>`. CORS response headers, the extension's `host_permissions`, and Host-header / DNS-rebinding hardening (a Host allowlist or a token) are left for the extension slice.

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

## Deferred

- Authentication and accounts
- Chrome extension UI, including CORS response headers, extension `host_permissions`, and Host-header / DNS-rebinding hardening (a Host allowlist or a token)
- Screenshots, activity, and idle tracking
- Approvals and reasons
- Reporting beyond the daily and weekly timesheets
- Members, roles, and people admin
- Pay rates, bill rates, budgets, and to-dos
- Import, duplicate, and transfer
- Invoicing, auto-invoicing, invoice notes, tax, and net terms
- Production deployment
