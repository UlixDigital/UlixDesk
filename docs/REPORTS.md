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
| Budgets | `/reports/budgets` | Budget, used, remaining, and percent. See [BUDGETS.md](BUDGETS.md) |
| Client invoices | `/reports/client-invoices` | Issued client invoices: number, client, status, total, paid, due, due date, and overdue. Owners and admins only. |
| Invoice aging | `/reports/invoice-aging` | Unpaid balances by client in Current, 1-30, 31-60, 61-90, and 90+ days past the due date. Owners and admins only. |

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
| `group` | `member`, `client`, `project`, `todo`, or `date`. Daily totals default to `date` (one row per day). The other reports default to `project`. `group=project` on Daily totals is the project breakdown. Weekly totals grouped by date use the week as the row. Members cannot group by member: that value is treated as the report's default. Time & Activity links keep `group` in the URL, including the default, so a shared link does not pick up someone else's last choice. |
| `then` | Time & Activity only. A second group, same values as `group`. Omitted when there is no second group. The same value as `group` is ignored. Members cannot use `member`. |
| `sort` | Time & Activity only. `name-asc`, `name-desc`, `time-desc`, `time-asc`, `billable-desc`, `billable-asc`, `amount-desc`, `amount-asc`, `amount-USD-desc` (any billing currency, and `asc` as well), `date-desc`, `date-asc`. Name is A-Z or Z-A. Time and billable time are high to low or low to high. Amount is high to low or low to high, and only for an owner or admin. A currency code sorts that column. With no currency code, currencies are compared one at a time in code order and are never added together. Date is newest (`date-desc`) or oldest (`date-asc`). The default is name A-Z, or date oldest when the first group is Date. Members who ask for an amount sort get the default instead. |
| `columns` | Comma-separated column ids, remembered in the browser per report (`localStorage` key `ulixdesk.report-columns.<report>`). |
| `page` | Work sessions only. 50 rows per page. |

An unknown member, client, or project id is ignored. A repeated query key such as `group=client&group=date` uses the first value.

Time & Activity can group twice, for example Member, then Project. Each first group is a subtotal row, the rows under it are the second group, and the footer is the grand total. One group is a row per group plus the grand total. Clicking a column header sorts by that column and shows an arrow. Hours sorts by total time, billable hours by billable time, an amount column by that currency, the group name by name, and a date group by date. The browser remembers the last group, second group, and sort for Time & Activity (`localStorage` key `ulixdesk.report-view.time-activity`). A URL that already has `group`, `then`, or `sort` wins.

## Amounts

Amounts use the bill rate that covers the entry: project, then member, then client. Each currency is its own column, labeled `Amount (USD)`, `Amount (JPY)`, and so on. The cell is `USD 10.00`. Currencies are never added together.

Billable time with no rate shows **No amount** in its own column. It is not treated as zero.

Owners and admins see everyone's rows and the amount columns. Members see only their own rows. The member page, the member CSV, and the member PDF have no amount columns and no currency codes. That limit is applied on the server. Asking for `columns=amount` does not add the column for a member. The member Time & Activity page does not say that owners and admins see amounts, and it does not offer Group by Member, Then by Member, or an amount sort.

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

The currency is in the header, not in the cell. There are no thousands separators. Summary reports drop the `No amount` column and add `Status`. For someone who can see money, a row with any unrated billable time is `No rate`; otherwise it is `Billable` or `Non-billable`. A member CSV has no money, so Status is `Billable` or `Non-billable` from the billable flag alone, never `No rate`. The total row leaves Status blank. A Time & Activity subtotal row leaves Status blank too. With a second group, the CSV has both group columns: the subtotal row names the first group and leaves the second blank, then one row per group inside it. Work sessions keep their Billable column.

Notes are written exactly as typed, including leading and trailing spaces. An empty note is an empty cell. The screen shows an em dash only when the note is an empty string. Cells that start with `=`, `+`, `-`, `@`, tab, or carriage return are prefixed with a single quote so a spreadsheet does not treat them as formulas.

The export stops at 5,000 time entries and returns `REPORT_TOO_LARGE`. Narrow the dates.

## PDF

**Export PDF** uses the same URL with `format=pdf`. Time edits use `/reports/manual-time-edits/export?format=pdf`. The route checks the session and applies the same role limits as the CSV, so a member PDF has no amounts.

The file is drawn on the server with pdfkit (pure JavaScript, standard Helvetica). It does not use headless Chromium. A character Helvetica cannot draw is replaced so the export still completes. Every PDF is US Letter. DejaVu Sans is free to embed, and it was left out: Helvetica is a base PDF font, so the image and the file do not carry a font, and Helvetica already draws the characters these reports use.

**Time & Activity** matches the screen. The PDF uses the same grouping, second group, sort, subtotals, and grand total as the table, and the same columns. It is US Letter, portrait unless the table has seven or more columns. The filter lines include Group by, Then by when a second group is set, and Sort. Members still get no amounts. A subtotal row is bold. The grand total is the last row.

Time & Activity, daily, weekly, and work session PDFs match the screen: the Ulix logo and gradient, the filter summary, the workspace timezone, and a total row. Amount headers include the currency (`Amount (USD)`). A table with seven or more columns is US Letter landscape, and amount columns are wide enough for the header and the total on one line. Fewer columns are US Letter portrait. The footer is `Page N of M`, drawn inside the bottom margin so it does not add a blank page. Durations and money use the same words as the screen (`5h`, `USD 400.00`). There is no activity percentage and no screenshots.

Time edits are blocks (who, when, action, source, and the fields), with the same header and page numbers. The export stops at 5,000 changes and returns `TIME_CHANGE_TOO_LARGE`.

## Saved reports

**Save report** stores the report type, the current filters, the grouping, the Time & Activity second group and sort, and the columns under a name. The name is required and at most 80 characters. Default ignorable characters and other controls are removed, and whitespace is collapsed. A name is rejected when nothing visible remains after also stripping separators, marks, and U+2800 BRAILLE PATTERN BLANK. A name that also has letters keeps those letters, including combining marks (`Octóber`). The name is unique for that person regardless of case (`October` and `october` are the same name). The database enforces that with an index on `lower(name)`. If rows that differ only by case already exist, the migration keeps the earliest and renames the rest `Name (2)`, `Name (3)`, in created order, before it creates the index.

| Visibility | Who can save it | Who can open it |
| --- | --- | --- |
| Private | Anyone | Only the creator |
| Shared with the workspace | Owners and admins | Everyone in the workspace |

A member who asks to share gets `SAVED_REPORT_SHARE`. Members can only save a report over their own rows: a member id and amount columns are removed before the row is stored. Opening a shared report as a member still limits the rows to that member and drops amounts, on the server.

The hub lists saved reports. **Open** restores the filters, grouping, and columns. Columns are always in the saved URL, including an empty list, so the browser's remembered columns do not replace them. **Rename** and **Delete** are available to the creator. An owner or admin can also rename or delete a shared report. A private report can only be changed by its creator.

Stored params are a plain object of strings. They are read back through the same date, enum, and column parsers as the report URL. A number, an array, or an unknown report type fails closed with `SAVED_REPORT_PARAMS` or `SAVED_REPORT_TYPE`. Unknown keys are dropped. An id that is not a single token is dropped. A column id that the report does not have is dropped.

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
| `SAVED_REPORT_TYPE` | The stored report type is not one of the seven. A member who tries to save a client invoice or aging report gets this too. |
| `SAVED_REPORT_PARAMS` | The stored params are not a plain object of strings. |

## Client invoices and aging

Both reports are for owners and admins. A member does not see the cards, cannot open the pages, and the CSV and PDF routes answer 403. A shared saved report of either type is hidden from members. Drafts and void invoices are excluded. Money stays in the invoice currency. Totals are per currency and are never added across currencies.

Client invoices filter by client, status (all, open, or paid), and issue date. The date control is the same preset list as the other reports. The default preset is this month. Overdue is yes when the due date is before today in the workspace timezone and the amount due is above zero. Due today is not overdue. Each row keeps paid plus amount due equal to the total.

Aging uses the end date of the same date control as the as-of date. The default preset is today, so the as-of date is today in Asia/Colombo. An invoice issued after that date is left out. The balance is the invoice total minus payments whose paid-on date is on or before the as-of date. Both dates are Asia/Colombo calendar dates. A payment after the as-of date does not reduce the balance, so an invoice that is paid today can still appear when you look back. Unpaid means that balance is above zero. Days past due are calendar days from the due date to the as-of date:

| Days past the due date | Bucket |
| --- | --- |
| 0 or not yet due | Current |
| 1–30 | 1-30 |
| 31–60 | 31-60 |
| 61–90 | 61-90 |
| 91 and later | 90+ |

**Export CSV** and **Export PDF** use `/reports/client-invoices/export` and `/reports/invoice-aging/export`, with `format=pdf` for the PDF. The file is every matching row, not a page. CSV amounts are numbers. The PDF matches the screen and uses the same header and page numbers as the other table reports. Save report stores the preset, dates, client, and, for client invoices, the status.

## Not in this slice

Emailing a report, schedules, and activity percentage wait for a later slice. Work sessions are sorted by start time. Time & Activity is the report with a saved sort.
