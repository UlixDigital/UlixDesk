# Bill rates

Slice 8 bills clients for tracked time. It does not track staff pay, payroll, tax, or invoices. Those stay later.

## Who can see money

Owners and admins can see and edit rates and billable amounts. Members cannot. The server drops rates before it builds a timesheet for a member, returns no money summary for a member, and `moneyExportFields` returns an empty object for a member. The clients list payload omits `currency` for every role, so a member's page does not include which currency a client uses. The extension project and timer APIs do not include rates or amounts. There is no CSV export in this slice. When one is added, it has to use `moneyExportFields` or `attachRates`.

## Currency

Each client has an ISO 4217 currency. Settings has one workspace default. A new client inherits that default and can change it. The picker is the list in `src/lib/currencies.ts`, with that currency's minor-unit digits (JPY has 0, USD has 2, BHD has 3).

Changing a client's currency does not rewrite rates already saved. Those rows keep the currency they were saved in. New rates use the client's current currency. Totals are grouped by currency and are never added across currencies.

The migration sets the workspace default and every existing client to USD. No rate rows are created.

## Rates

An hourly bill rate is optional. A missing rate is not zero: the amount stays blank. An explicit `0` shows as zero.

Three scopes, all in the client's currency at the time they are saved:

1. Project override, on the project page. A project with no client cannot have one.
2. Member override, on the client page, for one person and that client.
3. Client default, on the client page.

Precedence is project, then member, then client. A later effective date wins inside one scope. Saving the same date again adds a row. The latest save for that date is the one that applies. History lists every save.

`effectiveFrom` is a calendar date. The rate applies to time whose start is on or after 00:00 UTC that day. An entry that starts at 23:59:59.999 UTC the day before keeps the previous rate.

## Billable

A project is billable by default, and so is a time entry. Time is billed only when the project is billable and the entry is billable. A non-billable project wins: its entries are not billed, even if an entry is marked billable.

## Rounding

Money is an integer of minor units. Parsing a typed amount uses the decimal string, not a float. `10.50` USD is `1050`. `1500` JPY is `1500`. Extra decimal places are rejected.

The bill amount for a slice of time is:

```text
round_half_away_from_zero(rateMinor × durationMs / 3_600_000)
```

The division is integer arithmetic. A remainder of exactly half a minor unit rounds away from zero (up, for these positive amounts). Each slice is rounded on its own. A timesheet day rounds the hours that fall on that local day. A client or project total rounds each completed entry once, on its full duration. Splitting an entry across days can change the sum by one minor unit per extra slice.

## Error codes

Rate and currency actions return a human `error` and one of these `code` values:

| Code | Message |
|---|---|
| `RATE_FORBIDDEN` | You don't have permission to manage clients and projects. |
| `CURRENCY_INVALID` | Choose a currency. |
| `RATE_INVALID` | Enter an hourly rate, such as 50 or 50.00. |
| `RATE_INVALID` | Enter a smaller hourly rate. |
| `RATE_TOO_PRECISE` | This currency uses whole numbers only. |
| `RATE_TOO_PRECISE` | This currency allows N decimal places. |
| `RATE_DATE_INVALID` | Enter the date this rate starts. |
| `RATE_CLIENT_REQUIRED` | Link a client before setting a bill rate. |
| `RATE_MEMBER_REQUIRED` | Choose a member. |
| `RATE_NOT_FOUND` | This client no longer exists. |
| `RATE_NOT_FOUND` | This project no longer exists. |
| `RATE_NOT_FOUND` | That member no longer exists. |
| `RATE_SAVE_FAILED` | Something went wrong saving this rate. Try again. |
| `RATE_SAVE_FAILED` | Something went wrong saving the currency. Try again. |
