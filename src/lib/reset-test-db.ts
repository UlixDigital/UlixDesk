import { prisma } from "@/lib/db";
import { clearRequestTestState } from "@/lib/test-hooks";

/** Deletes workspace rows in foreign-key order. Shared by every integration test. */
export async function resetTestDatabase() {
  clearRequestTestState();
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
