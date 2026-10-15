# Reports

Slice 10 adds a reports hub at `/reports`. Activity percentage and screenshots are not part of UlixDesk.

## Reports

| Report | Path | What it shows |
| --- | --- | --- |
| Time & Activity | `/reports/time-activity` | Hours, billable hours, and amount for the whole range |
| Daily totals | `/reports/daily` | The same totals for each day |
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
| `from`, `to` | `YYYY-MM-DD`, used when the preset is `custom`. A repeated key uses the first value. A year outside 2000–2100 is clamped into that range. `9999-12-31` becomes `2100-12-31`. |
| `member` | A user id. Owners and admins only. Members are always limited to their own id. |
| `client` | A client id. |
| `project` | A project id. |
| `billable` | `all` (default), `billable`, or `non-billable`. Billable means the project is billable and the entry is billable. |
| `group` | `member`, `client`, `project` (default), or `date`. Weekly totals grouped by date use the week as the row. |
| `columns` | Comma-separated column ids, remembered in the browser per report (`localStorage` key `ulixdesk.report-columns.<report>`). |
| `page` | Work sessions only. 50 rows per page. |

An unknown member, client, or project id is ignored. A repeated query key such as `group=client&group=date` uses the first value.

## Amounts

Amounts use the bill rate that covers the entry: project, then member, then client. Each currency is its own column, labeled `Amount (USD)`, `Amount (JPY)`, and so on. The cell is `USD 10.00`. Currencies are never added together.

Billable time with no rate shows **No amount** in its own column. It is not treated as zero.

Owners and admins see everyone's rows and the amount columns. Members see only their own rows. The member page and the member CSV have no amount columns and no currency codes. That limit is applied on the server. Asking for `columns=amount` does not add the column for a member.

## CSV

**Export CSV** downloads `/reports/<report>/export` with the same query string. The route checks the session and applies the same role limits as the page. The file is the rows under those filters, groups, and columns. Work sessions export every matching row, not only the page on screen. The page says so.

Cells that start with `=`, `+`, `-`, `@`, tab, or carriage return are prefixed with a single quote so a spreadsheet does not treat them as formulas. Notes are included as typed.

The export stops at 5,000 time entries and returns `REPORT_TOO_LARGE`. Narrow the dates.

## Error codes

| Code | When |
| --- | --- |
| `REPORT_RANGE_ORDER` | The start date is after the end date. |
| `REPORT_TOO_LARGE` | More than 5,000 time entries match. |
| `REPORT_NOT_FOUND` | The export path is not one of the four reports. |

Time edits keep their own `RANGE_ORDER` code.

## Not in this slice

Saved reports, PDF export, emailing a report, and activity percentage wait for a later slice.
