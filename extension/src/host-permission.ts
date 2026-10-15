/**
 * Host access is requested for the chosen origin only.
 * Other origins the person already granted stay granted.
 */
export function hostAccessRequest(pattern: string) {
  return { origins: [pattern] };
}
