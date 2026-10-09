"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TIME_ZONE_COOKIE } from "@/lib/time-zone";

export function TimezoneSync() {
  const router = useRouter();

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return;
    const current = document.cookie
      .split("; ")
      .find((item) => item.startsWith(`${TIME_ZONE_COOKIE}=`))
      ?.slice(TIME_ZONE_COOKIE.length + 1);
    let decoded = "";
    if (current) {
      try {
        decoded = decodeURIComponent(current);
      } catch {
        decoded = "";
      }
    }
    if (decoded === timeZone) return;
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(timeZone)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  }, [router]);

  return null;
}
