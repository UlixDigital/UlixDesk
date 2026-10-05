import Link from "next/link";
import type { ReactNode } from "react";
import { BuildingIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { clientsHref, type EmptyStateKind } from "@/lib/client-display";
import { ui } from "@/lib/ui";

export function EmptyState({
  kind,
  query,
  status,
}: {
  kind: EmptyStateKind;
  query: string;
  status: "active" | "archived";
}) {
  if (kind === "no-matches") {
    return (
      <Shell icon={<SearchIcon className="h-6 w-6" />}>
        <h2 className="text-lg font-semibold break-words text-slate-900">
          No clients match “{query}”
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Search checks names on this tab. Try a different name, or clear the
          search.
        </p>
        <div className="mt-6">
          <Link href={clientsHref(status)} className={ui.secondaryButton}>
            Clear search
          </Link>
        </div>
      </Shell>
    );
  }

  if (kind === "no-archived") {
    return (
      <Shell icon={<BuildingIcon className="h-6 w-6" />}>
        <h2 className="text-lg font-semibold text-slate-900">
          No archived clients
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          When you archive a client, they leave Active and stay here until you
          restore them.
        </p>
      </Shell>
    );
  }

  if (kind === "no-active") {
    return (
      <Shell icon={<BuildingIcon className="h-6 w-6" />}>
        <h2 className="text-lg font-semibold text-slate-900">
          No active clients
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Everyone on this tab has been archived. Restore someone from the
          Archived tab, or add a new client.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link href="/clients?status=archived" className={ui.secondaryButton}>
            View archived clients
          </Link>
          <Link href="/clients/new" className={ui.primaryButton}>
            <PlusIcon className="h-4 w-4" />
            Add client
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell icon={<BuildingIcon className="h-6 w-6" />}>
      <h2 className="text-lg font-semibold text-slate-900">No clients yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        Add a client to keep the companies you work with in one place. A name
        is enough to start.
      </p>
      <div className="mt-6">
        <Link href="/clients/new" className={ui.primaryButton}>
          <PlusIcon className="h-4 w-4" />
          Add client
        </Link>
      </div>
    </Shell>
  );
}

function Shell({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-800">
        {icon}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
