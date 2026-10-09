import Link from "next/link";
import type { ReactNode } from "react";
import { FolderIcon, PlusIcon, SearchIcon } from "@/components/icons";
import {
  projectEmptyCopy,
  projectsClearHref,
  projectsHref,
  type ProjectEmptyKind,
  type ProjectStatus,
} from "@/lib/project-display";
import { ui } from "@/lib/ui";

export function ProjectEmptyState({
  kind,
  query,
  clientId,
  status,
}: {
  kind: ProjectEmptyKind;
  query: string;
  clientId: string;
  status: ProjectStatus;
}) {
  const copy = projectEmptyCopy({
    kind,
    query,
    clientFiltered: Boolean(clientId),
  });

  if (kind === "no-matches") {
    return (
      <Shell icon={<SearchIcon className="h-6 w-6" />}>
        <h2 className="text-lg font-semibold break-words text-slate-900">
          {copy.title}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          {copy.body}
        </p>
        {copy.clearLabel ? (
          <div className="mt-6">
            <Link
              href={projectsClearHref(status, query, clientId, copy.clearLabel)}
              className={ui.secondaryButton}
            >
              {copy.clearLabel}
            </Link>
          </div>
        ) : null}
      </Shell>
    );
  }

  if (kind === "no-archived") {
    return (
      <Shell icon={<FolderIcon className="h-6 w-6" />}>
        <h2 className="text-lg font-semibold text-slate-900">{copy.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          {copy.body}
        </p>
      </Shell>
    );
  }

  if (kind === "no-active") {
    return (
      <Shell icon={<FolderIcon className="h-6 w-6" />}>
        <h2 className="text-lg font-semibold text-slate-900">{copy.title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          {copy.body}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={projectsHref("archived")}
            className={ui.secondaryButton}
          >
            View archived projects
          </Link>
          <Link href="/projects/new" className={ui.primaryButton}>
            <PlusIcon className="h-4 w-4" />
            Add project
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell icon={<FolderIcon className="h-6 w-6" />}>
      <h2 className="text-lg font-semibold text-slate-900">{copy.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{copy.body}</p>
      <div className="mt-6">
        <Link href="/projects/new" className={ui.primaryButton}>
          <PlusIcon className="h-4 w-4" />
          Add project
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
