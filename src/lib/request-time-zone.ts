import { cookies } from "next/headers";
import { isValidTimeZone, TIME_ZONE_COOKIE } from "@/lib/time-zone";

export async function getRequestTimeZone() {
  const jar = await cookies();
  const value = jar.get(TIME_ZONE_COOKIE)?.value ?? "";
  return isValidTimeZone(value) ? value : null;
}
