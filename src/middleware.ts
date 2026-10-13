import { NextResponse, type NextRequest } from "next/server";
import { sessionGate } from "@/lib/access-decision";
import { bearerSkipsHostCheck, hostGuardRefusal } from "@/lib/host-guard";
import { SESSION_COOKIE, verifySessionCookie } from "@/lib/session-cookie";

export async function middleware(request: NextRequest) {
  const refused = hostGuardRefusal({
    pathname: request.nextUrl.pathname,
    host: request.headers.get("host"),
    authorization: request.headers.get("authorization"),
  });
  if (refused) return refused;

  const tokenApi = bearerSkipsHostCheck(
    request.nextUrl.pathname,
    request.headers.get("authorization"),
  );
  // A bearer call is authenticated by the route. Pages need a signed session cookie.
  const cookie = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  const secret = process.env.ULIXDESK_SESSION_SECRET ?? "";
  const hasValidSession = cookie ? Boolean(await verifySessionCookie(cookie, secret)) : false;
  const gate = sessionGate({
    pathname: request.nextUrl.pathname,
    hasValidSession,
    isTokenApi: tokenApi || isOpenTokenPath(request.nextUrl.pathname),
  });
  if (gate.type === "redirect") {
    const url = request.nextUrl.clone();
    const target = new URL(gate.to, request.url);
    url.pathname = target.pathname;
    url.search = target.search;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

function isOpenTokenPath(pathname: string) {
  return (
    pathname === "/api/projects" ||
    pathname === "/api/timer" ||
    pathname === "/api/timer/start" ||
    pathname === "/api/timer/stop"
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
