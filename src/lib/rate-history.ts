/** One row per person and effective date. Input is newest save first. */
export function collapseRateHistory<T extends { userId: string | null; effectiveFrom: string }>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const row of rows) {
    const key = `${row.userId ?? ""}\0${row.effectiveFrom}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(row);
  }
  return kept;
}

/** The latest rate on or before today, one per person. Future-only dates get none. */
export function currentRateIds(
  rows: Array<{ id: string; userId: string | null; effectiveFrom: string }>,
  today: string,
): string[] {
  const chosen: string[] = [];
  const seenUser = new Set<string>();
  for (const row of rows) {
    const user = row.userId ?? "";
    if (seenUser.has(user) || row.effectiveFrom > today) continue;
    seenUser.add(user);
    chosen.push(row.id);
  }
  return chosen;
}
