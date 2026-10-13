import { headers } from "next/headers";
import { testState } from "@/lib/test-hooks";

export async function requestHeader(name: string) {
  if (process.env.VITEST === "true") {
    return testState.headers?.[name.toLowerCase()] ?? null;
  }
  const list = await headers();
  return list.get(name);
}

/** First address in X-Forwarded-For. Caddy is the only process that can set it. */
export async function requestIp() {
  const forwarded = await requestHeader("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0]?.trim();
    if (ip) return ip;
  }
  return (await requestHeader("x-real-ip"))?.trim() || "unknown";
}
