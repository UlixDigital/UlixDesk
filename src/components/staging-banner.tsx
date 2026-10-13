import { authCopy } from "@/lib/auth-copy";

/** Shown on every page when ULIXDESK_ENVIRONMENT is staging. */
export function StagingBanner() {
  if (process.env.ULIXDESK_ENVIRONMENT !== "staging") return null;
  return (
    <div className="bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-amber-950">
      {authCopy.stagingBanner}
    </div>
  );
}
