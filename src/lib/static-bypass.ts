/**
 * Paths that skip the session gate because they are framework assets or files
 * in `public/`. Add a public file here and in the middleware matcher together.
 * Do not bypass by file extension: a future `/reports/chart.svg` must stay signed in.
 */
export const PUBLIC_ASSET_PATHS = ["/favicon.ico", "/icon.svg", "/ulix-logo.svg"] as const;

export function isStaticBypass(pathname: string) {
  if (pathname === "/_next/static" || pathname.startsWith("/_next/static/")) return true;
  if (pathname === "/_next/image" || pathname.startsWith("/_next/image/")) return true;
  return (PUBLIC_ASSET_PATHS as readonly string[]).includes(pathname);
}
