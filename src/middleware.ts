import { NextResponse, type NextRequest } from "next/server";
import { isTokenApiPath, sessionGate } from "@/lib/access-decision";
import { bearerSkipsHostCheck, hostGuardRefusal } from "@/lib/host-guard";
import { REQUEST_PATH_HEADER } from "@/lib/request-path";
import { clearedSessionCookie, SESSION_COOKIE, verifySessionCookie } from "@/lib/session-cookie";

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
  const signatureOk = cookie ? Boolean(await verifySessionCookie(cookie, secret)) : false;
  const gate = sessionGate({
    pathname: request.nextUrl.pathname,
    hasValidSession: signatureOk,
    isTokenApi: tokenApi || isTokenApiPath(request.nextUrl.pathname),
  });

  if (gate.type === "redirect") {
    const url = request.nextUrl.clone();
    const target = new URL(gate.to, request.url);
    url.pathname = target.pathname;
    url.search = target.search;
    const response = NextResponse.redirect(url);
    if (cookie && !signatureOk) clearCookie(response);
    return response;
  }

  const headers = new Headers(request.headers);
  headers.set(REQUEST_PATH_HEADER, request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers } });
  if (cookie && !signatureOk) clearCookie(response);
  return response;
}

function clearCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", clearedSessionCookie());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
