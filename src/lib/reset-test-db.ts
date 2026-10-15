import { prisma } from "@/lib/db";
import { clearRequestTestState } from "@/lib/test-hooks";

/**
 * Test-only. DELETE and TRUNCATE on TimeChange are rejected, including for the
 * table owner. Disabling the delete trigger is allowed for the owner and for a
 * superuser, and is refused for the app role.
 */
export async function deleteTimeChangesForTests(db: {
  $executeRawUnsafe: (query: string) => Promise<unknown>;
}) {
  await db.$executeRawUnsafe(`ALTER TABLE "TimeChange" DISABLE TRIGGER "time_change_no_delete"`);
  await db.$executeRawUnsafe(`DELETE FROM "TimeChange"`);
  await db.$executeRawUnsafe(`ALTER TABLE "TimeChange" ENABLE TRIGGER "time_change_no_delete"`);
}

/** Deletes workspace rows in foreign-key order. Shared by every integration test. */
export async function resetTestDatabase() {
  clearRequestTestState();
  await deleteTimeChangesForTests(prisma);
  await prisma.savedReport.deleteMany();
  await prisma.billRate.deleteMany();
  await prisma.workspaceSettings.deleteMany();
  await prisma.runningTimer.deleteMany();
  await prisma.session.deleteMany();
  await prisma.passwordSetup.deleteMany();
  await prisma.extensionSession.deleteMany();
  await prisma.accessToken.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.project.deleteMany();
  await prisma.clientEmail.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
}
