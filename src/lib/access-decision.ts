/** Paths that do not need a session cookie. The set-password token is the credential. */
export function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/set-password" ||
    pathname.startsWith("/set-password/")
  );
}

export function safeNextPath(pathname: string) {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return "/clients";
  if (pathname.startsWith("/login") || pathname.startsWith("/set-password")) return "/clients";
  return pathname;
}

/**
 * Pages without a valid session cookie redirect to sign-in.
 * The extension API routes stay open here so they can accept a bearer token
 * and answer 401 themselves. A signature check is not a database lookup:
 * a cookie that was revoked still passes this gate and fails in the layout.
 */
export function sessionGate(input: {
  pathname: string;
  hasValidSession: boolean;
  isTokenApi: boolean;
}): { type: "allow" } | { type: "redirect"; to: string } {
  if (isPublicPath(input.pathname) || input.isTokenApi) return { type: "allow" };
  if (input.hasValidSession) return { type: "allow" };
  const next = safeNextPath(input.pathname);
  const params = new URLSearchParams();
  if (next !== "/clients") params.set("next", next);
  const query = params.toString();
  return { type: "redirect", to: query ? `/login?${query}` : "/login" };
}
