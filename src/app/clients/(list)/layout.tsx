import Link from "next/link";
import { PlusIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";
import { ui } from "@/lib/ui";

/**
 * The title is outside the page Suspense boundary created by loading.tsx.
 * Next swaps a streamed fallback in with a script, so without JavaScript the
 * heading has to be in this layout or sign-in lands on the skeleton.
 */
export default async function ClientsListLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getCurrentUser();
  const canManage = actor ? canManageWorkspace(actor.role) : false;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Clients</h1>
          <p className="mt-1 text-sm text-slate-600">
            Companies and contacts you track time for.
          </p>
        </div>
        {canManage ? (
          <Link href="/clients/new" className={ui.primaryButton}>
            <PlusIcon className="h-4 w-4" />
            Add client
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  );
}
