import type { Metadata } from "next";
import Link from "next/link";
import { ClientSearch } from "@/components/client-search";
import { ClientsList } from "@/components/clients-list";
import { EmptyState } from "@/components/empty-state";
import { PlusIcon } from "@/components/icons";
import {
  clientCountLabel,
  clientsHref,
  emptyStateKind,
  matchingClientsLabel,
  parseClientStatus,
} from "@/lib/client-display";
import { countClientsByStatus, loadClientLists } from "@/lib/clients";
import { cn } from "@/lib/cn";
import { ui } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Clients",
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const status = parseClientStatus(params.status);
  const query = (params.q ?? "").trim();
  const [lists, totals] = await Promise.all([
    loadClientLists(query),
    countClientsByStatus(),
  ]);
  const clients = lists[status];
  const empty = emptyStateKind({
    status,
    query,
    visibleCount: clients.length,
    otherCount: status === "active" ? totals.archived : totals.active,
  });

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Clients
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Companies and contacts you track time for.
          </p>
        </div>
        <Link href="/clients/new" className={ui.primaryButton}>
          <PlusIcon className="h-4 w-4" />
          Add client
        </Link>
      </div>

      <ClientSearch status={status} query={query} />

      <div className="mt-6 border-b border-slate-200">
        <nav aria-label="Client status" className="-mb-px flex gap-6">
          <StatusTab
            href={clientsHref("active", query)}
            label="Active"
            count={totals.active}
            current={status === "active"}
          />
          <StatusTab
            href={clientsHref("archived", query)}
            label="Archived"
            count={totals.archived}
            current={status === "archived"}
          />
        </nav>
      </div>

      {query && clients.length > 0 ? (
        <p role="status" className="mt-4 text-sm text-slate-600">
          {matchingClientsLabel(clients.length, query)}
        </p>
      ) : null}

      {empty ? (
        <EmptyState kind={empty} query={query} status={status} />
      ) : (
        <ClientsList clients={clients} archived={status === "archived"} />
      )}
    </div>
  );
}

function StatusTab({
  href,
  label,
  count,
  current,
}: {
  href: string;
  label: string;
  count: number;
  current: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700",
        current
          ? "border-teal-700 text-teal-800"
          : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900",
      )}
    >
      {label}
      <span className="sr-only">, {clientCountLabel(count)}</span>
      <span
        aria-hidden="true"
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-semibold",
          current ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600",
        )}
      >
        {count}
      </span>
    </Link>
  );
}
