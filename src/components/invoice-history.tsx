import { invoiceCopy, invoiceStatusLabel } from "@/lib/invoice-copy";

export function InvoiceHistory({
  events,
  emails,
  timeZone,
}: {
  events: Array<{ id: string; fromStatus: string; toStatus: string; reason: string; createdAt: Date; actor: { name: string } }>;
  emails: Array<{
    id: string;
    toAddresses: string[];
    ccAddresses: string[];
    subject: string;
    success: boolean;
    error: string | null;
    createdAt: Date;
    sentBy: { name: string };
  }>;
  timeZone: string;
}) {
  return (
    <div className="space-y-6">
      <section id="invoice-status-history">
        <h2 className="text-sm font-semibold text-ink">{invoiceCopy.auditTitle}</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">{invoiceCopy.auditEmpty}</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">{invoiceCopy.historyWhen}</th>
                  <th className="px-3 py-2 font-medium">{invoiceCopy.historySender}</th>
                  <th className="px-3 py-2 font-medium">{invoiceCopy.auditFrom}</th>
                  <th className="px-3 py-2 font-medium">{invoiceCopy.auditTo}</th>
                  <th className="px-3 py-2 font-medium">{invoiceCopy.reason}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-t border-slate-200">
                    <td className="px-3 py-2 whitespace-nowrap">{formatWhen(event.createdAt, timeZone)}</td>
                    <td className="px-3 py-2">{event.actor.name}</td>
                    <td className="px-3 py-2">{invoiceStatusLabel(event.fromStatus)}</td>
                    <td className="px-3 py-2">{invoiceStatusLabel(event.toStatus)}</td>
                    <td className="px-3 py-2">{event.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section id="invoice-email-history">
        <h2 className="text-sm font-semibold text-ink">{invoiceCopy.historyTitle}</h2>
        {emails.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">{invoiceCopy.historyEmpty}</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">{invoiceCopy.historyWhen}</th>
                  <th className="px-3 py-2 font-medium">{invoiceCopy.historySender}</th>
                  <th className="px-3 py-2 font-medium">{invoiceCopy.historyTo}</th>
                  <th className="px-3 py-2 font-medium">{invoiceCopy.historyCc}</th>
                  <th className="px-3 py-2 font-medium">{invoiceCopy.sendSubject}</th>
                  <th className="px-3 py-2 font-medium">{invoiceCopy.historyResult}</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((email) => (
                  <tr key={email.id} className="border-t border-slate-200">
                    <td className="px-3 py-2 whitespace-nowrap">{formatWhen(email.createdAt, timeZone)}</td>
                    <td className="px-3 py-2">{email.sentBy.name}</td>
                    <td className="px-3 py-2">{email.toAddresses.join(", ")}</td>
                    <td className="px-3 py-2">{email.ccAddresses.join(", ") || "—"}</td>
                    <td className="px-3 py-2">{email.subject}</td>
                    <td className="px-3 py-2">
                      {email.success ? invoiceCopy.historySent : invoiceCopy.historyFailed}
                      {email.error ? <span className="mt-1 block text-rose-800">{email.error}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatWhen(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}
