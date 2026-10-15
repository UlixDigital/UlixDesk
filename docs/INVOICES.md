# Invoices

Owners and admins manage invoices. Members have no invoice pages, and the invoice PDF route answers 403 for them. A member never sees bill rates or invoice amounts in the staff app.

## Status

| From | To | When it is allowed |
| --- | --- | --- |
| draft | open | Mark as issued, or send the draft (that issues it first, after confirmation). |
| open | void | No payment row and `paidMinor` is 0. |
| open | draft | Reopen. No payment recorded. The time slices stay reserved on this draft. |
| void | draft | Reopen. No payment recorded, every slice still fits its time entry, and no other invoice has an active slice on that window. |

Paid and partially paid are stored statuses. This slice does not move an invoice into them, and it does not void or reopen them once a payment exists.

Void sets `InvoiceTime.active` to false. The edit lock ignores void, so the time can be changed. The overlap constraint `InvoiceTime_no_overlap` only covers active windows, so the time can be billed on another invoice. Reopen of a void invoice sets `active` back to true inside the same transaction. That is the check against `InvoiceTime_no_overlap`. If another invoice took the window, or the entry was edited so the slice no longer fits, reopen is refused and the void invoice stays void.

Every transition writes `InvoiceStatusEvent`: actor, from, to, timestamp, and reason. Issue uses "Marked as issued", or "Issued when the invoice was sent" when sending a draft. Void and reopen ask for a reason.

Deleting a draft is not a status change. The number stays in `InvoiceNumber`.

## Client link

The link is `/v/<token>`. The token is 32 random bytes (256 bits), encoded as base64url.

The database stores the SHA-256 hash, which is what the public page looks up. It also stores an AES-256-GCM sealed copy, keyed from `ULIXDESK_SESSION_SECRET`, so an owner or admin can copy the same link later and put it in an email. The plaintext is not stored and is not written to the audit log. This is the retrievable option: after a reload, Copy link still shows the current URL.

Revoke clears the hash and the sealed copy. The old token then returns 404. Regenerate replaces both, which also invalidates the previous token.

The public page and its PDF need no login. They show that invoice only: number, status, the client name and billing address, dates, lines, totals, notes, and bank details. They do not show other invoices, staff accounts, or the audit log. A draft does not load, even if a link exists. A void invoice loads and is marked void. Responses send `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.

The public page and PDF share a per-address limit of 60 requests a minute. The PDF answers 429. The HTML page shows the same limit message.

## Email

Sending uses SMTP with nodemailer. For Google Workspace, set:

| Variable | Example |
| --- | --- |
| `INVOICE_SMTP_HOST` | `smtp.gmail.com` |
| `INVOICE_SMTP_PORT` | `587` |
| `INVOICE_SMTP_USER` | the Workspace address |
| `INVOICE_SMTP_PASS` | an app password, not the account password |
| `INVOICE_SMTP_FROM` | the From address |
| `INVOICE_SMTP_FROM_NAME` | optional display name |

Port 587 uses STARTTLS (`requireTLS`). Any of host, port, user, password, or from left blank means email is not configured. The invoice page says so, the send button stays disabled, and Copy link still works. Tests never open an SMTP socket. They install a capture transport, and Vitest refuses a real connection even if those variables are set.

The form accepts several To and Cc addresses (comma, semicolon, or whitespace). To is required. The subject and message are editable. The defaults include the invoice number, amount due, due date, and client link. The PDF is attached. Each attempt is stored: time, sender, To, Cc, subject, and success or the error.

Sending a draft requires confirmation, then issues the saved draft, then sends. If the tracked time changed, the same review as Mark as issued is shown before the send. A failed send is recorded and does not undo the issue.

Client billing emails are the addresses on the client (`ClientEmail`). The client form labels them Billing emails. They prefill To.

## Settings text

A line that starts with `#` in invoice notes or bank details is saved and printed. The one-time bank seed file is different: there, a `#` line is a comment and is not saved.
