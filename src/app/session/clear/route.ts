import { NextResponse } from "next/server";
import { safeResumePath } from "@/lib/access-decision";
import { destroySessionCookie } from "@/lib/session";
import { clearedSessionCookie, readCookieHeader, SESSION_COOKIE } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

/** Drops a stale session and sends the browser to sign-in or the password link. */
export async function GET(request: Request) {
  const next = safeResumePath(new URL(request.url).searchParams.get("next"));
  await destroySessionCookie(readCookieHeader(request.headers.get("cookie"), SESSION_COOKIE));
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: next, "cache-control": "no-store" },
  });
  response.cookies.set(SESSION_COOKIE, "", clearedSessionCookie());
  return response;
}
