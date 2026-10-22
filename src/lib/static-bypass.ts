/**
 * Paths that skip the session gate because they are framework assets or files
 * in `public/`. Add a public file here and in the middleware matcher together.
 * Do not bypass by file extension: a future `/reports/chart.svg` must stay signed in.
 *
 * `/_next/image` is not public. The logo uses `next/image` with `unoptimized`
 * and is served from `/ulix-logo.svg`. The client invoice page does not use
 * the optimizer, so an unauthenticated request must hit the session gate.
 */
export const PUBLIC_ASSET_PATHS = ["/favicon.ico", "/icon.svg", "/ulix-logo.svg"] as const;

export function isStaticBypass(pathname: string) {
  if (pathname === "/_next/static" || pathname.startsWith("/_next/static/")) return true;
  return (PUBLIC_ASSET_PATHS as readonly string[]).includes(pathname);
}
