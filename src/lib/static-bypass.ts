/**
 * Paths that skip the session gate because they are framework assets or files
 * in `public/`. Add a public file here and in the middleware matcher together.
 * Do not bypass by file extension: a future `/reports/chart.svg` must stay signed in.
 *
 * `/_next/image` is not public. Logos use `next/image` with `unoptimized`
 * and are served from `/ulix-logo.svg`, including the client invoice page.
 * An unauthenticated request for the optimizer must hit the session gate.
 */
export const PUBLIC_ASSET_PATHS = ["/favicon.ico", "/icon.svg", "/ulix-logo.svg"] as const;

export function isStaticBypass(pathname: string) {
  if (pathname === "/_next/static" || pathname.startsWith("/_next/static/")) return true;
  return (PUBLIC_ASSET_PATHS as readonly string[]).includes(pathname);
}
