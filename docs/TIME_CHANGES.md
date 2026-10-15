# Manual time edits

Slice 9 records every time entry create, edit, delete, and timer start or stop. The report is at `/reports/manual-time-edits`.

## What is stored

Each change is one row in `TimeChange`. The row stores the actor, the time, the entry id, and the before and after values for start, end, duration, project, client, notes, and billable. Duration is milliseconds. A running timer has no end and no duration.

The row does not store a rate, a currency, or an amount. Members never see money, so the log does not keep it.

`source` is the channel:

| Source | When it is written |
|---|---|
| `web` | The timesheet, the header timer, or a timer API call that uses the session cookie |
| `extension` | A timer API call that uses a Chrome extension sign-in |
| `api` | A timer API call that uses an access token, including the Extension access fallback token |

Manual adds, edits, and deletes exist only in the web app, so those actions are `web`. Timer start and stop can be any of the three.

`action` is `added`, `edited`, `deleted`, `started`, or `stopped`. The report filter Timer matches started and stopped.

The audit row is inserted in the same database transaction as the time entry change. If the insert fails, the time entry change is rolled back too.

## Append-only

The app has no update or delete for these rows. Postgres rejects both with `time change rows are append-only`.

`timeEntryId` is not a foreign key. Deleting a time entry does not cascade into the log, and the report still shows the deleted entry. Deletes stay permanent. The entry row is removed. The log row stays.

Users are not deleted in the app. The actor and the entry owner are foreign keys with `ON DELETE RESTRICT`, so a user row that still has log rows cannot be removed.

## Who can see a row

Owners and admins see everyone's changes. They can filter by member, client, project, action, and a date range.

Members see changes to their own entries only. The server applies that limit even if the query asks for someone else. Members do not get the member filter, so other people's names are not in the page. A change an admin makes to a member's entry is visible to that member, marked as edited by the admin for them. Example: "Edited by Jane for Sam".

The date range is the workspace timezone, the same zone as timesheets. It filters when the change was saved, not the day the time was tracked. The default range is the current Monday–Sunday week.

## Existing entries

Entries saved before this log existed have no history. The report says so. The migration does not invent rows for them.

## Error codes

The report is a page. An inverted date range is shown on the page and is not an API error.

| Code | Message |
|---|---|
| `RANGE_ORDER` | The start date has to be on or before the end date. |

Timer API error codes are unchanged. A failed start or a stop under one second does not write a log row.

## Not in this slice

A reason on the edit, grouping, and CSV export wait for a later reports slice. The page is not a full audit log of clients, projects, or rates.
