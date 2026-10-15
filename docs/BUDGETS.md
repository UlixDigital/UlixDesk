# Budgets

A project and a client each have at most one budget. Owners and admins create and edit them. Members never see money.

## Shape

| Field | Meaning |
| --- | --- |
| Basis | `hours` or `cost`. Hours are stored as whole seconds. Cost is minor units of the currency stored on the row. |
| Currency | The client's currency, or the workspace currency when a project has no client. It is copied onto the row when the budget is saved, so a later currency change does not reinterpret the amount. |
| Type | `total` (lifetime), `weekly` (Monday–Sunday), or `monthly` (calendar month). Weeks and months are computed in the workspace timezone. The default timezone is Asia/Colombo. |
| Starts on | Optional. Time before 00:00 that day is ignored. If today is before the start date, used time is zero and a hard stop does not apply. A start date inside the current week or month clips the start of that period. |
| Billable time only | When on, non-billable time is ignored. Billable means the entry is billable and the project is billable. |
| Alert | Optional whole percent from 1 to 99. The project and client pages, and the report, show "This budget has used N% (alert at A%)." Starting a timer or adding time returns that same warning to someone who is allowed to see the budget. Reaching 100% is also a warning on the page. Email alerts are not sent yet. |
| Hard stop | Projects only. The check uses the budget period that contains the entry's start, in the workspace timezone, not the current period. At 100% of that period, new timer starts and new manual entries are refused. Moving an existing entry onto that project, or into that period, is refused for every role. On a project that is already at 100%, an edit that increases counted usage (a longer entry, or switching to billable on a billable-only budget) is refused. An edit that keeps usage the same or reduces it is allowed. The entry that crosses 100% is still saved. Stopping a timer that is already running is not blocked. A client budget cannot set a hard stop. |

Usage counts completed entries only. A running timer is not usage. An entry that overlaps the period is clipped to the period, then rounded once with the same half-up rule as bill rates.

Cost counts only a rate in the budget's currency. Billable time with no rate, or a rate in another currency, is unrated. The used amount shows the known cost plus the no-amount mark `—`, or only `—` when nothing was rated. Remaining and percent are `—`. A hard stop uses the known cost. Unrated time does not, by itself, reach the stop while that known cost is under the limit. Non-billable time is not unrated.

## Who can see it

Owners and admins see hours and cost, on the project page, the client page, the report, the CSV, and the PDF.

Members see hours budgets for projects they have tracked time on, including a timer that is still running and an entry they just added. The used hours are the whole project, so the progress matches the hard stop. They do not see client budgets, cost budgets, or a currency, in the page, the API error, the CSV, or the PDF. A cost budget on a project they track is omitted. The page says that hours budgets for projects they track show there, and it does not say that a cost budget exists. An alert uses the same rule: a member gets the percent only for an hours budget on a project they have tracked. A cost budget, or a project they have never tracked, returns no warning and no hint that a budget exists. The `alertProject` query cannot widen that.

The hard-stop error is the same for everyone and contains no amount:

> This project has reached its budget. New time can't be started or added until the budget resets or someone raises it.

The web app, the Chrome extension, and `POST /api/timer/start` all use that check. Manual adds and edits use the same check in the server action. The API returns `409` and `BUDGET_REACHED` when the stop applies. When a start or a manual add is allowed and the viewer may see that budget, the response includes `warnings`. The web header and the extension popup show the first warning. A member's response leaves `warnings` empty for a cost budget or a project they have not tracked.

## Report

`/reports/budgets` lists budget, used, remaining, percent, and status. Status is Not started, Reached, No rate, Alert, or On track. Reached wins over No rate.

Filters are client, project, projects or clients, and whether to include archived subjects. The same query string is used for **Export CSV** and **Export PDF**. A date range does not change a budget's period. Each budget already has its own window.

The PDF is US Letter, in the same style as the other reports. Eight columns (the manager table) are landscape. A member table has no Type column. The CSV puts the currency in a header, not in the cell. An unrated cost row leaves used, remaining, and percent empty and sets Status to `No rate`.

## Migrations

`20261015212000_budgets` creates `Budget`. `20261015211000_session_rotation_grace` is separate: a session refresh that loses a race keeps the previous token for 60 seconds so a second in-flight refresh is not a sign-out.
