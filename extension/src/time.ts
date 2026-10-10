/** Elapsed time as HH:MM:SS, matching the UlixDesk header timer. */
export function formatElapsed(ms: number) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

/** Toolbar badge: a dot under a minute, otherwise whole elapsed minutes. */
export function badgeText(startedAt: string, now: number) {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return "•";
  const minutes = Math.floor(Math.max(0, now - started) / 60_000);
  if (minutes < 1) return "•";
  if (minutes > 9999) return "9999";
  return String(minutes);
}
