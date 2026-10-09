# UlixDesk

UlixDesk is Ulix Digital's internal time-tracking app. The product follows the same shape as Hubstaff: a directory of clients, then projects, then time tracked against that work.

This repository contains **Slice 1: Clients** and **Slice 2: Projects**. The team can create and edit clients and projects, archive and restore them, and search each directory. A project can optionally belong to one client.

There is no login in these slices. Authentication comes later. The app is an internal MVP backed by a local database.

Time tracking is planned as a Chrome extension, not a desktop app. The extension is not part of these slices.

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

Open [http://localhost:3000](http://localhost:3000). The home page redirects to [http://localhost:3000/clients](http://localhost:3000/clients). Projects live at [http://localhost:3000/projects](http://localhost:3000/projects).

`npm install` generates the Prisma client. `npx prisma migrate deploy` creates the local SQLite database at `prisma/dev.db` and applies every migration, including the Slice 2 projects migration. That file is gitignored.

If you already have a Slice 1 database, run `npx prisma migrate deploy` again before starting the app. That adds description, billable, and `archivedAt` on projects.

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
```

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

## Deferred

- Authentication and accounts
- Time tracking
- Chrome extension (the planned time-tracking client)
- Reporting and screenshots
- Members, roles, and people admin
- Pay rates, bill rates, budgets, and to-dos
- Activity and idle toggles
- Import, duplicate, and transfer
- Invoicing, auto-invoicing, invoice notes, tax, and net terms
- Production deployment
