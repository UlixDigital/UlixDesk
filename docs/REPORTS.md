# Reports

Slice 10 adds a reports hub at `/reports`. Activity percentage and screenshots are not part of UlixDesk.

## Reports

| Report | Path | What it shows |
| --- | --- | --- |
| Time & Activity | `/reports/time-activity` | Hours, billable hours, and amount for the whole range |
| Daily totals | `/reports/daily` | One total for each day. Group by project for a breakdown of that day. |
| Weekly totals | `/reports/weekly` | The same totals for each Monday–Sunday week |
| Work sessions | `/reports/work-sessions` | One row per time entry: start, end, duration, project, client, notes, and billable |
| Time edits | `/reports/manual-time-edits` | The append-only edit log. See [TIME_CHANGES.md](TIME_CHANGES.md) |

The nav label is **Reports**. The hub heading is **Reports**. The time edit log heading is **Time edits**, the same words as its card on the hub.

Time & Activity, daily totals, and weekly totals count only the part of an entry that falls inside the selected range. An entry that crosses midnight in the workspace timezone is split at midnight, the same way the timesheet splits it. Work sessions list the entry's real start, end, and full duration when the entry overlaps the range.

Weeks are Monday through Sunday in the workspace timezone.

## Filters

Filters live in the URL.

| Param | Values |
| --- | --- |
| `preset` | `today`, `this-week`, `last-week`, `this-month`, `last-month`, `custom`. The default is `this-week`. |
| `from`, `to` | `YYYY-MM-DD`, used when the preset is `custom`. A repeated key uses the first value. A real date before `2000-01-01`, including years `0001`–`0099`, becomes `2000-01-01`. A real date after `2100-12-31` becomes `2100-12-31`. The month and day are not kept. `1999-06-15` and `0004-02-29` become `2000-01-01`. `2104-02-29` and `9999-12-31` become `2100-12-31`. |
| `member` | A user id. Owners and admins only. Members are always limited to their own id. |
| `client` | A client id. |
| `project` | A project id. |
| `billable` | `all` (default), `billable`, or `non-billable`. Billable means the project is billable and the entry is billable. |
| `group` | `member`, `client`, `project`, or `date`. Daily totals default to `date` (one row per day). The other reports default to `project`. `group=project` on Daily totals is the project breakdown. Weekly totals grouped by date use the week as the row. Members cannot group by member: that value is treated as the report's default. |
| `columns` | Comma-separated column ids, remembered in the browser per report (`localStorage` key `ulixdesk.report-columns.<report>`). |
| `page` | Work sessions only. 50 rows per page. |

An unknown member, client, or project id is ignored. A repeated query key such as `group=client&group=date` uses the first value.

## Amounts

Amounts use the bill rate that covers the entry: project, then member, then client. Each currency is its own column, labeled `Amount (USD)`, `Amount (JPY)`, and so on. The cell is `USD 10.00`. Currencies are never added together.

Billable time with no rate shows **No amount** in its own column. It is not treated as zero.

Owners and admins see everyone's rows and the amount columns. Members see only their own rows. The member page, the member CSV, and the member PDF have no amount columns and no currency codes. That limit is applied on the server. Asking for `columns=amount` does not add the column for a member. The member Time & Activity page does not say that owners and admins see amounts, and it does not offer Group by Member.

Amount columns are right-aligned on the screen. The screen still formats money (`USD 400.00`) and durations (`5h`).

## CSV

**Export CSV** downloads `/reports/<report>/export` with the same query string. The route checks the session and applies the same role limits as the page. The file is every matching row under those filters, groups, and columns, not only the page on screen.

Hours and amounts are numbers. The screen formatting stays on the screen.

| Screen column | CSV header | CSV cell |
| --- | --- | --- |
| Hours | `Hours (decimal)` | `5.0000` (four decimal places, half-up) |
| Billable hours | `Billable hours (decimal)` | `4.0000` |
| Duration | `Duration (decimal)` | `1.5000` |
| Amount (USD) | `Amount (USD)` | `400.00` |
| Amount (JPY) | `Amount (JPY)` | `1500` |

The currency is in the header, not in the cell. There are no thousands separators. Summary reports drop the `No amount` column and add `Status`: `Billable`, `Non-billable`, or `No rate`. A row with any unrated time is `No rate`. The total row leaves Status blank. Work sessions keep their Billable column.

Notes are written exactly as typed, including leading and trailing spaces. An empty note is an empty cell. The screen shows an em dash only when the note is an empty string. Cells that start with `=`, `+`, `-`, `@`, tab, or carriage return are prefixed with a single quote so a spreadsheet does not treat them as formulas.

The export stops at 5,000 time entries and returns `REPORT_TOO_LARGE`. Narrow the dates.

## PDF

**Export PDF** uses the same URL with `format=pdf`. Time edits use `/reports/manual-time-edits/export?format=pdf`. The route checks the session and applies the same role limits as the CSV, so a member PDF has no amounts.

The file is drawn on the server with pdfkit (pure JavaScript, standard Helvetica). It does not use headless Chromium. A character Helvetica cannot draw is replaced so the export still completes.

**Time & Activity** is US Letter landscape. Every page has the Ulix logo, a thin rule, and the date range at the top right. The first page title is "Time & Activity Report", then the organization name "Ulix Digital", then a grand total of Time, Billed Amount, and Billable Time. There is no organization field on the workspace, so the name is the product name. Each client is a section, sorted A to Z. Inside it, one bold group row per date and member, then one detail row per project. UlixDesk has no to-do. The To-dos column is the project name, and a blank project name is "(No to-do)" in italics. To-do ID is always blank. Notes are "Manually added" or "Edited", plus the entry note. Durations are `H:MM:SS`. Money uses the rate's currency (`$723.22`, `¥1,500`). A member PDF drops the billed columns. The footer is "Generated with", the Ulix logo, the app URL, and `Page X of Y`. A group row is not left at the bottom of a page without its first detail row. A table that continues repeats the column header.

Daily, weekly, and work session PDFs still match the screen: the Ulix logo and gradient, the filter summary, the workspace timezone, and a total row per currency. The footer is `Page N of M`.

Time edits are blocks (who, when, action, source, and the fields), with the same header and page numbers. The export stops at 5,000 changes and returns `TIME_CHANGE_TOO_LARGE`.

## Saved reports

**Save report** stores the report type, the current filters, the grouping, and the columns under a name. The name is required, at most 80 characters, and unique for that person (case-sensitive). Whitespace is collapsed.

| Visibility | Who can save it | Who can open it |
| --- | --- | --- |
| Private | Anyone | Only the creator |
| Shared with the workspace | Owners and admins | Everyone in the workspace |

A member who asks to share gets `SAVED_REPORT_SHARE`. Members can only save a report over their own rows: a member id and amount columns are removed before the row is stored. Opening a shared report as a member still limits the rows to that member and drops amounts, on the server.

The hub lists saved reports. **Open** restores the filters, grouping, and columns. Columns are always in the saved URL, including an empty list, so the browser's remembered columns do not replace them. **Rename** and **Delete** are available to the creator. An owner or admin can also rename or delete a shared report. A private report can only be changed by its creator.

Stored params are a plain object of strings. They are read back through the same date, enum, and column parsers as the report URL. A number, an array, or an unknown report type fails closed with `SAVED_REPORT_PARAMS` or `SAVED_REPORT_TYPE`. Unknown keys are dropped. An id that is not a single token is dropped.

## Error codes

| Code | When |
| --- | --- |
| `REPORT_RANGE_ORDER` | The start date is after the end date. |
| `REPORT_TOO_LARGE` | More than 5,000 time entries match. |
| `REPORT_NOT_FOUND` | The export path is not one of the four reports. |
| `RANGE_ORDER` | The time edit range is backwards. |
| `TIME_CHANGE_TOO_LARGE` | More than 5,000 time changes match the PDF. |
| `SAVED_REPORT_NAME` | The name is empty. |
| `SAVED_REPORT_NAME_LONG` | The name is longer than 80 characters. |
| `SAVED_REPORT_DUPLICATE` | That person already has this name. |
| `SAVED_REPORT_SHARE` | A member tried to share a report. |
| `SAVED_REPORT_NOT_FOUND` | The saved report is missing, or it is private and belongs to someone else. |
| `SAVED_REPORT_FORBIDDEN` | The person can see the report but cannot rename or delete it. |
| `SAVED_REPORT_TYPE` | The stored report type is not one of the five. |
| `SAVED_REPORT_PARAMS` | The stored params are not a plain object of strings. |

## Not in this slice

Emailing a report, schedules, and activity percentage wait for a later slice. Work sessions are sorted by start time. There is no separate sort control to save.
