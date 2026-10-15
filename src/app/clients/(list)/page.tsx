import type { Metadata } from "next";
import Link from "next/link";
import { ClientSearch } from "@/components/client-search";
import { ClientsList, type ClientListItem } from "@/components/clients-list";
import { EmptyState } from "@/components/empty-state";
import {
  clientCountLabel,
  clientsHref,
  emptyStateKind,
  matchingClientsLabel,
  parseClientStatus,
} from "@/lib/client-display";
import { countClientsByStatus, loadClientLists } from "@/lib/clients";
import { cn } from "@/lib/cn";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";

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
  const actor = await getCurrentUser();
  const canManage = actor ? canManageWorkspace(actor.role) : false;
  const empty = emptyStateKind({
    status,
    query,
    visibleCount: clients.length,
    otherCount: status === "active" ? totals.archived : totals.active,
  });

  return (
    <div>
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
        <ClientsList
          clients={clients.map((client): ClientListItem => ({
            id: client.id,
            name: client.name,
            address: client.address,
            phone: client.phone,
            emails: client.emails,
          }))}
          archived={status === "archived"}
          canManage={canManage}
        />
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
        "inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
        current
          ? "border-accent text-accent"
          : "border-transparent text-slate-600 hover:border-slate-300 hover:text-ink",
      )}
    >
      {label}
      <span className="sr-only">, {clientCountLabel(count)}</span>
      <span
        aria-hidden="true"
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-semibold",
          current ? "bg-primary-50 text-accent" : "bg-slate-100 text-slate-600",
        )}
      >
        {count}
      </span>
    </Link>
  );
}
