# UlixDesk

UlixDesk is Ulix Digital's internal time-tracking app. The product follows the same shape as Hubstaff: a directory of clients, then projects, then time tracked against that work.

This repository currently contains **Slice 1: Clients**. The team can create a client, edit contact details, archive and restore clients, and search the directory by name.

There is no login in this slice. Authentication comes later. Slice 1 is an internal MVP backed by a local database.

Time tracking is planned as a Chrome extension, not a desktop app. The extension is not part of this slice.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS 4
- Prisma 6 + SQLite for local development

The repository was empty aside from a title, so this is the first application stack.

## Run locally

From the repository root:

```bash
npm install
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The home page redirects to [http://localhost:3000/clients](http://localhost:3000/clients).

`npm install` generates the Prisma client. `npx prisma migrate deploy` creates the local SQLite database at `prisma/dev.db`. That file is gitignored.

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
- Search by name within the current tab.
- Empty states for no clients, no active clients while archives exist, no archived clients, and no search matches.
- Server-side validation, including a required name.
- A `Project` model stub with an optional `clientId`, for the next slice. There is no Projects UI.

Emails are stored in a related table because SQLite does not support Prisma scalar lists. The form edits them as chips.

## Deferred

- Authentication and accounts
- Projects UI
- Time tracking
- Chrome extension (the planned time-tracking client)
- Reporting and screenshots
- Invoicing, budgets, auto-invoicing, import/export, invoice notes, tax, and net terms
- People admin
- Production deployment
