import { prisma } from "@/lib/db";
import { assignLegacyWorkspaceToOwner as assign } from "../../scripts/lib/assign-legacy.mjs";

export const LEGACY_TIMER_ID = "workspace";

export function assignLegacyWorkspaceToOwner(ownerId: string) {
  return assign(prisma, ownerId);
}
