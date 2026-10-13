import type { Metadata } from "next";
import { AccessTokenSettings } from "@/components/access-token-settings";
import { listAccessTokens } from "@/lib/access-tokens";
import { getRequestTimeZone } from "@/lib/request-time-zone";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Extension access",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const [tokens, timeZone] = await Promise.all([
    user ? listAccessTokens(user.id) : Promise.resolve([]),
    getRequestTimeZone(),
  ]);

  return (
    <AccessTokenSettings
      timeZone={timeZone ?? "UTC"}
      tokens={tokens.map((token) => ({
        id: token.id,
        name: token.name,
        createdAt: token.createdAt.toISOString(),
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        revokedAt: token.revokedAt?.toISOString() ?? null,
      }))}
    />
  );
}
