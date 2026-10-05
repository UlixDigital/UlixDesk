"use client";

import Link from "next/link";
import { clientsHref, type ClientStatus } from "@/lib/client-display";
import { ui } from "@/lib/ui";
import { SearchIcon } from "@/components/icons";

export function ClientSearch({
  status,
  query,
}: {
  status: ClientStatus;
  query: string;
}) {
  return (
    <form
      role="search"
      action="/clients"
      method="get"
      className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      {status === "archived" ? (
        <input type="hidden" name="status" value="archived" readOnly />
      ) : null}
      <div className="relative min-w-0 flex-1">
        <label htmlFor="client-search" className="sr-only">
          Search clients by name
        </label>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          key={query}
          id="client-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search by name"
          autoComplete="off"
          className={`${ui.input} pl-9`}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className={ui.secondaryButton}>
          Search
        </button>
        {query ? (
          <Link href={clientsHref(status)} className={ui.secondaryButton}>
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}
