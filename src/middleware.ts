import { NextResponse, type NextRequest } from "next/server";
import { hostGuardRefusal } from "@/lib/host-guard";

export function middleware(request: NextRequest) {
  const refused = hostGuardRefusal({
    pathname: request.nextUrl.pathname,
    host: request.headers.get("host"),
    authorization: request.headers.get("authorization"),
  });
  if (refused) return refused;
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
