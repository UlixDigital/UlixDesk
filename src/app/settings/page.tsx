import type { Metadata } from "next";
import { AccessTokenSettings } from "@/components/access-token-settings";
import { ChangePasswordForm } from "@/components/change-password-form";
import { ExtensionDownloadCard } from "@/components/extension-download-card";
import { WorkspaceCurrencyForm } from "@/components/workspace-currency-form";
import { WorkspaceTimeZoneForm } from "@/components/workspace-timezone-form";
import { listAccessTokens } from "@/lib/access-tokens";
import { readExtensionRelease } from "@/lib/extension-artifact";
import { getWorkspaceCurrency, getWorkspaceTimeZone } from "@/lib/bill-rates";
import { listExtensionSessions } from "@/lib/extension-session";
import { getRequestTimeZone } from "@/lib/request-time-zone";
import { getCurrentUser } from "@/lib/session";
import { canManageWorkspace, canSeeMoney } from "@/lib/users-validation";

export const metadata: Metadata = {
  title: "Extension access",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const manager = Boolean(user && canManageWorkspace(user.role));
  const [tokens, sessions, browserZone, currency, workspaceZone, extension] = await Promise.all([
    user ? listAccessTokens(user.id) : Promise.resolve([]),
    user ? listExtensionSessions(user.id) : Promise.resolve([]),
    getRequestTimeZone(),
    user && canSeeMoney(user.role) ? getWorkspaceCurrency() : Promise.resolve(null),
    manager ? getWorkspaceTimeZone() : Promise.resolve(null),
    readExtensionRelease(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <ExtensionDownloadCard build={extension} timeZone={browserZone ?? "UTC"} />
      {workspaceZone ? <WorkspaceTimeZoneForm timeZone={workspaceZone} /> : null}
      {currency ? <WorkspaceCurrencyForm currency={currency} /> : null}
      <ChangePasswordForm />
      <AccessTokenSettings
        timeZone={browserZone ?? "UTC"}
        sessions={sessions.map((session) => ({
          id: session.id,
          label: session.label,
          createdAt: session.createdAt.toISOString(),
          lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
          revokedAt: session.revokedAt?.toISOString() ?? null,
        }))}
        tokens={tokens.map((token) => ({
          id: token.id,
          name: token.name,
          createdAt: token.createdAt.toISOString(),
          lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
          revokedAt: token.revokedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
