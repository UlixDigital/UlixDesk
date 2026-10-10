import { badgeText } from "./time";

export type BadgeTimer = { startedAt: string; projectName?: string } | null;

export type BadgeFailure = "unauthorized" | "unreachable" | "other" | null;

export type BadgeDecision =
  | { action: "set"; text: string }
  | { action: "clear" }
  | { action: "keep" };

export function decideBadge(input: {
  configured: boolean;
  permission: boolean;
  failure: BadgeFailure;
  timer: BadgeTimer;
  now: number;
}): BadgeDecision {
  if (!input.configured || !input.permission) return { action: "clear" };
  if (input.failure === "unreachable") return { action: "keep" };
  if (input.failure || !input.timer) return { action: "clear" };
  return { action: "set", text: badgeText(input.timer.startedAt, input.now) };
}
