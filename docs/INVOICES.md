# Invoices

Owners and admins manage invoices. Members have no invoice pages, and the invoice PDF route answers 403 for them. A member never sees bill rates or invoice amounts in the staff app.

## Manual invoices

New invoice starts a draft with no lines. From tracked time is the existing flow, which builds lines from uninvoiced billable time. Both allocate the number from `InvoiceNumber` with the workspace prefix (LE unless settings change it). A number is never reused, including after the draft is deleted. The currency is the client's currency. The issue date is today in the workspace timezone (Asia/Colombo) and the due date is that day plus the default net terms.

New invoice offers two equal choices: Blank invoice and From tracked time. Each page uses that title.

A manual line (`InvoiceLine.kind = custom`) has a description, an optional date range (`rangeStart` and `rangeEnd`, both or neither, collapsed until you open them), a quantity kind, a quantity, and a unit price. The amount is quantity times unit price, rounded to minor units with the same half-away-from-zero rule as a bill rate. Manual lines do not create `InvoiceTime` rows, so they do not lock time and they do not take part in `InvoiceTime_no_overlap` or `time_entry_invoice_lock`.

`quantityKind` is `hours` or `item`. Hours are the duration behaviour below. An item is a plain count, such as 1 × 500 for a flat fee. New manual lines start as items. Existing custom lines stay hours. The count is stored in `quantityMs` scaled by 100000, so 1 is 100000 and 1.5 is 150000. `quantitySeconds` is 0 on an item line. The page, the PDF, and `/v/` show that count as a plain number, not `H:MM:SS`.

Hours quantity is stored as `quantityMs`, an integer number of milliseconds. `quantitySeconds` is that duration rounded to the nearest second, half a second away from zero (the same rule as `secondsFromMs`). The page and the PDF show `H:MM:SS` when the milliseconds are a whole number of seconds. Otherwise they show the decimal hours.

- `H:MM:SS`, or `H:MM` with the seconds taken as 0, is an exact number of seconds. `quantityMs = quantitySeconds × 1000`.
- A plain number is a number of hours, such as `1.5` or `2`. It is parsed with integer arithmetic, not a binary float. At most five decimal places are accepted. Five places is the limit that still converts to an integer number of milliseconds: one hour is 3,600,000 ms, and 3,600,000 is divisible by 100,000, so `0.00001` hour is exactly 36 ms. `1.5` is exactly `1:30:00`. `1.25` is exactly `1:15:00`.
- The line amount is `round(unitPriceMinor × quantityMs / 3_600_000)`, half away from zero. That is `billAmountMinor` for a duration in milliseconds. When the quantity is a whole number of seconds it matches `lineAmountMinor(unitPriceMinor, quantitySeconds)`. A fractional second is billed from the milliseconds, not from the rounded second.

A blank draft hides the period in the header, the unrated-time warning, and the Tracked time section until the draft has a time line. Add tracked time opens that section.

Tracked time on a draft uses the existing slice logic. The draft's period and grouping choose the window. Windows already on another active invoice are left out, so the same time is not billed twice. Those lines stay `kind = time` and keep their `InvoiceTime` rows. Adding tracked time is the Refresh from time action.

A time line's title is the project name. When the lines are split by member, the title is the project name and the member name. A day line keeps the date.

A tracked-time line's quantity is read-only. The form shows "Edit the time entries, then Refresh from time". Saving a different quantity is refused, including a request that does not use the form. The description and the unit price can still be edited. The amount is the stored quantity times the new unit price. A different amount is a manual line. Refresh from time still replaces time lines from the slices, so it does not keep a quantity typed over a time line.

Refresh from time replaces every time line and its slices with a fresh derive. It does not delete manual lines. Their description, date range, quantity, unit price, and amount are the values submitted with the refresh, so an edit in the form is saved. Manual lines are not given `InvoiceTime` rows. After a refresh, tracked-time lines are listed first in the newly derived order, and manual lines follow in the order they were submitted. A manual line that had been moved above a time line returns to after the time lines. Saving the draft without refreshing keeps the order you set. The number, client, and currency do not change. If `InvoiceTime_no_overlap` rejects the new windows, the refresh is rolled back and the draft is unchanged.

Issuing a draft that already has time lines still compares those lines with a fresh derive and asks for confirmation when they differ. Confirming replaces the time lines the same way and keeps the manual lines. Issuing is refused when the invoice would have no lines, including when the tracked time has all moved out of the period. The draft stays a draft. Issuing a draft that has no time lines does not pull in tracked time and does not lock any time entry. When the total is zero and there is at least one line, Mark as issued and Send both mark it paid in the same action. An amount discount larger than the subtotal is refused. It is not reduced to the subtotal. `paidMinor` stays 0 and no payment row is written. The audit is two `InvoiceStatusEvent` rows: draft to open with the usual issue reason, then open to paid with the reason "Auto-paid because the total is zero". There is no event-kind enum, so that reason is the auto-paid kind. Reports list the invoice as paid. Aging leaves it out, because nothing is due. The PDF date block says Status: Paid, and the client page shows Paid. Void and reopen still apply, because no payment was recorded. A paid invoice that has a payment stays blocked until that payment is deleted.

Void and reopen of an invoice with only manual lines follow the same payment rules as any other invoice. The checks for a deleted entry, a moved client, an edited slice, and an overlapping window apply only to time lines. With no `InvoiceTime` rows there is nothing to restore, and reopen does not fail for missing time. An auto-paid zero-total invoice is the same: void and reopen are allowed while `paidMinor` is 0 and there is no payment row.

The optional tax line and notes are unchanged. After the draft exists, the PDF, send, client link, void, reopen, and payments are the same path as a time invoice. On an issued invoice the lines come first. Payments, the client link, and the history follow. Void is a secondary danger action. On the PDF, a manual line's date range is the detail under the description, in the same format as a tracked-time line. An hours quantity is `H:MM:SS` when the stored milliseconds are a whole number of seconds. An item quantity is the plain count.

## Status

| From | To | When it is allowed |
| --- | --- | --- |
| draft | open | Mark as issued, or send the draft (that issues it first, after confirmation). |
| open | void | No payment row and `paidMinor` is 0. |
| open | draft | Reopen. No payment recorded. The time slices stay reserved on this draft. |
| void | draft | Reopen. No payment recorded. Every billed time entry still exists and still belongs to this client. Every slice still fits its time entry, and no other invoice has an active slice on that window. |

Paid is the status once the amount due is 0. A partial payment leaves the status open and updates Paid and Amount due. `partially_paid` remains a stored status from the invoice table, and this slice does not write it. An invoice that is already `partially_paid` can still take a payment; afterward it is open (balance remaining) or paid (balance zero).

## Payments

Owners and admins record a payment on an open invoice. The amount is integer minor units of the invoice currency (the client's currency when the invoice was created). The field accepts a plain number, or a comma in the same thousands places the invoice displays (`1,000` or `1,000.50`). A comma anywhere else is refused. Each payment stores the paid-on date, the method (bank transfer, card, cash, check, or other), an optional note, and who recorded it. The invoice page lists that history. Correct replaces the amount, date, method, and note. Delete removes the row. Every record, correction, and deletion writes `InvoiceStatusEvent` with the actor, the status before and after, and a reason that names the amount.

Paid and amount due are shown on the invoice page, the public client page, and the PDF. Amount due is total minus paid. The page, the public page, and the PDF show Overdue when the due date is before today in the workspace timezone (Asia/Colombo) and a balance remains. Due today is not overdue.

An amount above the balance is refused. Nothing is stored, and no credit is created. Hubstaff's client invoice article describes recording the amount and the date, then showing the invoice as paid, and deleting that payment to unmark it ([How to Invoice Clients](https://support.hubstaff.com/invoice-clients/), "Recording Payments" and "Unmark an Invoice as Paid"). It does not describe accepting more than the balance. The team invoice article says an amount less than the balance stays partially paid until the balance is fully paid ([Team invoices](https://support.hubstaff.com/team-invoices/), "Recording payments on team invoices"). Credit notes in Hubstaff's own subscription bills are a different product ([How to read your Hubstaff subscription's invoice](https://support.hubstaff.com/how-to-read-your-hubstaff-subscriptions-invoice/)). UlixDesk does not record an overpayment in this slice.

Void stays available only for an open invoice with no payment row and `paidMinor` of 0. A paid invoice is not open, so void is refused until every payment is deleted. Deleting the payments sets `paidMinor` back to 0 and the status back to open, and void is allowed again.

Reopen stays available only for an open or void invoice with no payment recorded. A paid invoice cannot be reopened. Delete or reduce the payments first. A remaining balance returns the status to open, and reopen is still refused while any payment row exists. After the last payment is deleted, reopen follows the rules already in the table above.

| From | To | When it is allowed |
| --- | --- | --- |
| open | open | A payment is recorded or corrected and a balance remains. |
| open | paid | The amount due becomes 0. |
| paid | open | A payment is deleted or reduced so a balance remains. |

Void sets `InvoiceTime.active` to false. The edit lock ignores void, so the time can be changed or deleted, and a project can be moved to another client. The overlap constraint `InvoiceTime_no_overlap` only covers active windows, so the time can be billed on another invoice. Reopen of a void invoice sets `active` back to true inside the same transaction. That is the check against `InvoiceTime_no_overlap`. Reopen is refused, and the void invoice stays void, when a billed entry was deleted, the entry now belongs to another client, another invoice took the window, or the entry was edited so the slice no longer fits.

Every transition writes `InvoiceStatusEvent`: actor, from, to, timestamp, and reason. A payment that leaves the status unchanged still writes a row, so a partial payment is `open` to `open`. Issue uses "Marked as issued", or "Issued when the invoice was sent" when sending a draft. Void and reopen ask for a reason.

Deleting a draft is not a status change. The number stays in `InvoiceNumber`.

## Client link

The link is `/v/<token>`. The token is 32 random bytes (256 bits), encoded as base64url.

The database stores the SHA-256 hash, which is what the public page looks up. It also stores an AES-256-GCM sealed copy, keyed from `INVOICE_LINK_KEY`, so an owner or admin can copy the same link later and put it in an email. The plaintext is not stored and is not written to the audit log. This is the retrievable option: after a reload, Copy link still shows the current URL.

`INVOICE_LINK_KEY` is 32 bytes. Use base64 from `openssl rand -base64 32`, or 64 hex characters. If it is missing or not that format, creating or regenerating a link fails and says so. Opening a link someone already has still works, because that uses the hash. Showing the address again reports that the key is missing or does not match. Rotating `ULIXDESK_SESSION_SECRET` does not change the link key.

If the key is lost or rotated, existing client links still open by that hash lookup. Creating a new link, or showing the plaintext token again, needs the current key. Regenerating a link invalidates the old token: the previous address returns 404. Sending a draft also needs a valid key. If the key is missing or invalid, Send refuses and leaves the draft as a draft. Mark as issued still works without the key.

Revoke clears the hash and the sealed copy. The old token then returns 404. Regenerate replaces both, which also invalidates the previous token.

The public page and its PDF need no login. They show that invoice only: number, status, the client name and billing address, dates, lines, totals, paid, amount due, overdue when the due date has passed with a balance, notes, and bank details. They do not show other invoices, staff accounts, or the audit log. A draft does not load, even if a link exists. A void invoice loads and is marked void. Responses send `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.

The public page and PDF share a per-address limit of 60 requests a minute. The PDF answers 429. The HTML page shows the same limit message.

## Email

Sending uses SMTP with nodemailer. For Google Workspace, set:

| Variable | Example |
| --- | --- |
| `INVOICE_SMTP_HOST` | `smtp.gmail.com` |
| `INVOICE_SMTP_PORT` | `587` |
| `INVOICE_SMTP_USER` | the Workspace address |
| `INVOICE_SMTP_PASS` | an app password, not the account password |
| `INVOICE_SMTP_FROM` | the Gmail account, or a verified alias on that account |
| `INVOICE_SMTP_FROM_NAME` | optional display name |

Port 587 uses STARTTLS (`requireTLS`). Any of host, port, user, password, or from left blank means email is not configured. The invoice page says so, the send button stays disabled, and Copy link still works. Tests never open an SMTP socket. They install a capture transport, and Vitest refuses a real connection even if those variables are set.

The form accepts several To and Cc addresses (comma, semicolon, or whitespace). To is required. The subject and message are editable. The defaults include the invoice number, amount due, due date, and client link. The PDF is attached. Each attempt is stored: time, sender, To, Cc, subject, and success or the error.

A void invoice cannot be emailed. The send button is hidden, and a direct send is refused. Reopen it as a draft first if it should go out. The default message says the amount is due, which applies only to an invoice that can be sent.

Sending a draft requires a valid `INVOICE_LINK_KEY`, then confirmation, then issues the saved draft, then sends. If the key is missing or invalid, the send is refused and the draft stays a draft. Mark as issued still works without the key. If the tracked time changed, the same review as Mark as issued is shown before the send. A failed send is recorded and does not undo the issue.

`INVOICE_SMTP_FROM` must be the Gmail account in `INVOICE_SMTP_USER`, or a verified alias on that account. Plain steps for setting up the app password are in [DEPLOY.md](DEPLOY.md).

Client billing emails are the addresses on the client (`ClientEmail`). The client form labels them Billing emails. They prefill To.

## Settings text

A line that starts with `#` in invoice notes or bank details is saved and printed. The one-time bank seed file is different: there, a `#` line is a comment and is not saved.
