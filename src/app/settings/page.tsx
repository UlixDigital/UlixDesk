import type { Metadata } from "next";
import { AccessTokenSettings } from "@/components/access-token-settings";
import { ChangePasswordForm } from "@/components/change-password-form";
import { WorkspaceCurrencyForm } from "@/components/workspace-currency-form";
import { listAccessTokens } from "@/lib/access-tokens";
import { getWorkspaceCurrency } from "@/lib/bill-rates";
import { listExtensionSessions } from "@/lib/extension-session";
import { getRequestTimeZone } from "@/lib/request-time-zone";
import { getCurrentUser } from "@/lib/session";
import { canSeeMoney } from "@/lib/users-validation";

export const metadata: Metadata = {
  title: "Extension access",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const [tokens, sessions, timeZone, currency] = await Promise.all([
    user ? listAccessTokens(user.id) : Promise.resolve([]),
    user ? listExtensionSessions(user.id) : Promise.resolve([]),
    getRequestTimeZone(),
    user && canSeeMoney(user.role) ? getWorkspaceCurrency() : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      {currency ? <WorkspaceCurrencyForm currency={currency} /> : null}
      <ChangePasswordForm />
      <AccessTokenSettings
        timeZone={timeZone ?? "UTC"}
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
