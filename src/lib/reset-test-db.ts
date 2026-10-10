import { prisma } from "@/lib/db";

/** Deletes workspace rows in foreign-key order. Shared by every integration test. */
export async function resetTestDatabase() {
  await prisma.runningTimer.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.project.deleteMany();
  await prisma.clientEmail.deleteMany();
  await prisma.client.deleteMany();
}
