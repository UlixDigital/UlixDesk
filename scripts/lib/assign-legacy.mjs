/** Legacy running-timer id from before each person had an account. */
export const LEGACY_TIMER_ID = "workspace";

/**
 * Gives unowned time entries, and the old workspace timer, to an owner.
 * Safe to run more than once. Matches prisma/migrations/20261013121000_assign_legacy_owner.
 */
export async function assignLegacyWorkspaceToOwner(prisma, ownerId) {
  await prisma.$transaction(async (tx) => {
    await tx.timeEntry.updateMany({
      where: { userId: null },
      data: { userId: ownerId },
    });

    const legacy = await tx.runningTimer.findUnique({
      where: { id: LEGACY_TIMER_ID },
    });
    if (!legacy) return;

    const ownerTimer = await tx.runningTimer.findUnique({ where: { id: ownerId } });
    if (!ownerTimer) {
      await tx.runningTimer.delete({ where: { id: LEGACY_TIMER_ID } });
      await tx.runningTimer.create({
        data: { id: ownerId, timeEntryId: legacy.timeEntryId },
      });
      return;
    }

    await tx.timeEntry.updateMany({
      where: { id: legacy.timeEntryId, endedAt: null },
      data: { endedAt: new Date() },
    });
    await tx.runningTimer.delete({ where: { id: LEGACY_TIMER_ID } });
  });
}
