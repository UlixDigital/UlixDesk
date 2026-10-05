import Link from "next/link";
import { ArchiveButton, RestoreButton } from "@/components/client-row-actions";
import { clientSummary } from "@/lib/client-display";
import type { ClientRecord } from "@/lib/clients";
import { ui } from "@/lib/ui";

export function ClientsList({
  clients,
  archived,
}: {
  clients: ClientRecord[];
  archived: boolean;
}) {
  return (
    <section aria-label={archived ? "Archived clients" : "Active clients"}>
      <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,27,45,0.05)]">
        {clients.map((client) => (
          <li
            key={client.id}
            className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
          >
            <div className="min-w-0">
              <Link
                href={`/clients/${client.id}/edit`}
                className="text-base font-semibold break-words text-slate-900 hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                {client.name}
                <span className="sr-only">, edit client</span>
              </Link>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                {clientSummary(client)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href={`/clients/${client.id}/edit`}
                className={ui.secondaryButton}
              >
                Edit
                <span className="sr-only"> {client.name}</span>
              </Link>
              {archived ? (
                <RestoreButton id={client.id} name={client.name} />
              ) : (
                <ArchiveButton id={client.id} name={client.name} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
