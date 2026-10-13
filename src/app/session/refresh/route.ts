import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/access-decision";
import { destroySessionCookie, rotateSessionIfDue } from "@/lib/session";
import {
  clearedSessionCookie,
  readCookieHeader,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

/** Replaces a session token that is older than 15 minutes, then returns to the page. */
export async function GET(request: Request) {
  const next = safeNextPath(new URL(request.url).searchParams.get("next") ?? "/clients");
  const rotated = await rotateSessionIfDue();
  if (!rotated.ok) {
    await destroySessionCookie(readCookieHeader(request.headers.get("cookie"), SESSION_COOKIE));
    const response = new NextResponse(null, {
      status: 303,
      headers: { Location: "/login", "cache-control": "no-store" },
    });
    response.cookies.set(SESSION_COOKIE, "", clearedSessionCookie());
    return response;
  }
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: next, "cache-control": "no-store" },
  });
  if (rotated.cookie && rotated.expiresAt) {
    response.cookies.set(SESSION_COOKIE, rotated.cookie, sessionCookieOptions(rotated.expiresAt));
  }
  return response;
}
