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
| Alert | Optional whole percent from 1 to 99. The project and client pages, and the report, show a warning at that percent. Reaching 100% is also a warning. Email alerts are not sent yet. |
| Hard stop | Projects only. At 100% of the budget, new timer starts and new manual entries are refused. The entry that crosses 100% is still saved. The next one is not. Editing an existing entry and stopping a timer that is already running are not blocked. Client budgets never hard-stop. |

Usage counts completed entries only. A running timer is not usage. An entry that overlaps the period is clipped to the period, then rounded once with the same half-up rule as bill rates.

Cost counts only a rate in the budget's currency. Billable time with no rate, or a rate in another currency, is unrated. The used amount shows the known cost plus the no-amount mark `—`, or only `—` when nothing was rated. Remaining and percent are `—`. A hard stop uses the known cost. Unrated time does not, by itself, reach the stop while that known cost is under the limit. Non-billable time is not unrated.

## Who can see it

Owners and admins see hours and cost, on the project page, the client page, the report, the CSV, and the PDF.

Members see hours budgets for projects they have tracked time on, including a timer that is still running. The used hours are the whole project, so the progress matches the hard stop. They do not see client budgets, cost budgets, or a currency, in the page, the API error, the CSV, or the PDF. A cost budget on a project they track is omitted. The page says that hours budgets for projects they track show there, and it does not say that a cost budget exists.

The hard-stop error is the same for everyone and contains no amount:

> This project has reached its budget. New time can't be started or added until the budget resets or someone raises it.

The web app, the Chrome extension, and `POST /api/timer/start` all use that check. The API returns `409` and `BUDGET_REACHED`. The extension shows the server message as an alert.

## Report

`/reports/budgets` lists budget, used, remaining, percent, and status. Status is Not started, Reached, No rate, Alert, or On track. Reached wins over No rate.

Filters are client, project, projects or clients, and whether to include archived subjects. The same query string is used for **Export CSV** and **Export PDF**. A date range does not change a budget's period. Each budget already has its own window.

The PDF is US Letter, in the same style as the other reports. Eight columns (the manager table) are landscape. A member table has no Type column. The CSV puts the currency in a header, not in the cell. An unrated cost row leaves used, remaining, and percent empty and sets Status to `No rate`.

## Migrations

`20261015212000_budgets` creates `Budget`. `20261015211000_session_rotation_grace` is separate: a session refresh that loses a race keeps the previous token for 60 seconds so a second in-flight refresh is not a sign-out.
