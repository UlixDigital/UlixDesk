import type { Metadata } from "next";
import { AccessTokenSettings } from "@/components/access-token-settings";
import { ChangePasswordForm } from "@/components/change-password-form";
import { listAccessTokens } from "@/lib/access-tokens";
import { listExtensionSessions } from "@/lib/extension-session";
import { getRequestTimeZone } from "@/lib/request-time-zone";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Extension access",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const [tokens, sessions, timeZone] = await Promise.all([
    user ? listAccessTokens(user.id) : Promise.resolve([]),
    user ? listExtensionSessions(user.id) : Promise.resolve([]),
    getRequestTimeZone(),
  ]);

  return (
    <>
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
    </>
  );
}
