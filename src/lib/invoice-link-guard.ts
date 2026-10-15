/**
 * Stand-in keys written by scripts/write-local-stack-env.mjs.
 * They are valid 32-byte keys for the laptop stack only.
 */
export const LOCAL_STACK_INVOICE_LINK_KEYS = [
  "bG9jYWwtc3RhZ2luZy1pbnZvaWNlLWxpbmsta2V5ISE=",
  "bG9jYWwtcHJvZC1pbnZvaWNlLWxpbmsta2V5ISEhISE=",
] as const;

/**
 * The local stack keys are refused on a public UlixDesk host, the same way
 * the local development session secret is refused.
 */
export function invoiceLinkKeyProblem(key: string, hosts = "") {
  const value = key.trim();
  if (!hosts.includes("ulixdigital.com")) return null;
  if ((LOCAL_STACK_INVOICE_LINK_KEYS as readonly string[]).includes(value)) {
    return "Refusing the local invoice link key on a public UlixDesk host.";
  }
  return null;
}
