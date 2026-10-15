import { AppShell } from "@/components/app-shell";
import { PermissionNote } from "@/components/permission-note";
import { invoiceCopy } from "@/lib/invoice-copy";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";

export const dynamic = "force-dynamic";

export default async function InvoicesLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) {
    return (
      <AppShell>
        <PermissionNote message={invoiceCopy.denied} />
      </AppShell>
    );
  }
  return <AppShell>{children}</AppShell>;
}
