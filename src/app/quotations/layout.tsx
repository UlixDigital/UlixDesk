import { AppShell } from "@/components/app-shell";
import { PermissionNote } from "@/components/permission-note";
import { quotationCopy } from "@/lib/quotation-copy";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace } from "@/lib/users-validation";

export const dynamic = "force-dynamic";

export default async function QuotationsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !canManageWorkspace(user.role)) {
    return (
      <AppShell>
        <PermissionNote message={quotationCopy.denied} />
      </AppShell>
    );
  }
  return <AppShell>{children}</AppShell>;
}
