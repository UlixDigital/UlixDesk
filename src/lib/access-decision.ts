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
  const path = pathname.split("?")[0] ?? pathname;
  if (
    path.startsWith("/login") ||
    path.startsWith("/set-password") ||
    path.startsWith("/session")
  ) {
    return "/clients";
  }
  return path;
}

/**
 * Where to send someone after the session cookie is cleared.
 * Only sign-in and the set-password link are allowed. Anything else goes to sign-in.
 */
export function safeResumePath(value: string | null) {
  if (!value) return "/login";
  let url: URL;
  try {
    url = new URL(value, "http://ulixdesk.local");
  } catch {
    return "/login";
  }
  if (url.origin !== "http://ulixdesk.local") return "/login";
  if (url.pathname !== "/login" && url.pathname !== "/set-password") return "/login";
  return `${url.pathname}${url.search}`;
}

/**
 * Pages without a valid session cookie redirect to sign-in.
 * The extension API routes stay open here so they can accept a bearer token
 * and answer 401 themselves. A signature check is not a database lookup:
 * a cookie that was revoked still passes this gate and fails in the layout.
 */
/** API routes that answer without a session cookie. Bearer or extension sign-in handles them. */
export function isTokenApiPath(pathname: string) {
  return (
    pathname === "/api/projects" ||
    pathname === "/api/timer" ||
    pathname === "/api/timer/start" ||
    pathname === "/api/timer/stop" ||
    pathname === "/api/extension/session" ||
    pathname === "/api/extension/session/refresh" ||
    pathname === "/api/extension/session/revoke"
  );
}

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
