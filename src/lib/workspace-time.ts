/** IANA zone used when the workspace row has none. Colombo does not observe DST. */
export const DEFAULT_TIME_ZONE = "Asia/Colombo";

/** IANA zones for the settings picker. The current value stays selectable if it is an alias. */
export function workspaceTimeZoneOptions(current: string) {
  const zones = Intl.supportedValuesOf("timeZone").slice().sort((a, b) => a.localeCompare(b));
  if (current && !zones.includes(current)) zones.unshift(current);
  return zones;
}
