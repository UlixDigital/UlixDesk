import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import {
  createSavedReport,
  deleteSavedReport,
  listVisibleSavedReports,
  renameSavedReport,
} from "@/lib/saved-reports";
import { createTestUser } from "@/lib/test-actor";

const today = "2026-10-15";

let ownerId = "";
let adminId = "";
let memberId = "";

beforeEach(async () => {
  await resetTestDatabase();
  ownerId = (await createTestUser("owner", "owner-saved@ulix.test")).id;
  adminId = (await createTestUser("admin", "admin-saved@ulix.test")).id;
  memberId = (await createTestUser("member", "member-saved@ulix.test")).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("saved report records", () => {
  it("saves, lists, renames, and deletes by the permission rule", async () => {
    const owner = { id: ownerId, role: "owner" };
    const admin = { id: adminId, role: "admin" };
    const member = { id: memberId, role: "member" };
    const shared = await createSavedReport({
      actor: owner,
      name: "October activity",
      reportType: "time-activity",
      visibility: "shared",
      params: {
        preset: "custom",
        from: "2026-10-01",
        to: "2026-10-31",
        member: memberId,
        columns: "hours,amount",
        group: "member",
      },
      today,
    });
    expect(shared.ok).toBe(true);
    const denied = await createSavedReport({
      actor: member,
      name: "Shared by a member",
      reportType: "daily",
      visibility: "shared",
      params: { columns: "hours,amount", member: ownerId },
      today,
    });
    expect(denied).toMatchObject({ ok: false, code: "SAVED_REPORT_SHARE" });
    const mine = await createSavedReport({
      actor: member,
      name: "Mine",
      reportType: "time-activity",
      visibility: "private",
      params: { columns: "hours,amount", member: ownerId, group: "member" },
      today,
    });
    expect(mine.ok).toBe(true);
    if (!mine.ok || !shared.ok) return;
    const stored = await prisma.savedReport.findUniqueOrThrow({ where: { id: mine.id } });
    expect(stored.params).toEqual({ columns: "hours" });

    const memberList = await listVisibleSavedReports(member);
    expect(memberList.map((row) => row.name).sort()).toEqual(["Mine", "October activity"]);
    const ownerList = await listVisibleSavedReports(owner);
    expect(ownerList.map((row) => row.name)).toEqual(["October activity"]);

    const duplicate = await createSavedReport({
      actor: owner,
      name: "October activity",
      reportType: "weekly",
      visibility: "private",
      params: {},
      today,
    });
    expect(duplicate).toMatchObject({ ok: false, code: "SAVED_REPORT_DUPLICATE" });
    const differentCase = await createSavedReport({
      actor: owner,
      name: "october ACTIVITY",
      reportType: "daily",
      visibility: "private",
      params: {},
      today,
    });
    expect(differentCase).toMatchObject({ ok: false, code: "SAVED_REPORT_DUPLICATE" });

    expect(await deleteSavedReport({ actor: member, id: shared.id })).toMatchObject({
      ok: false,
      code: "SAVED_REPORT_FORBIDDEN",
    });
    expect(await deleteSavedReport({ actor: owner, id: mine.id })).toMatchObject({
      ok: false,
      code: "SAVED_REPORT_NOT_FOUND",
    });
    expect((await renameSavedReport({ actor: admin, id: shared.id, name: "October totals" })).ok).toBe(
      true,
    );
    expect((await deleteSavedReport({ actor: admin, id: shared.id })).ok).toBe(true);
    expect((await deleteSavedReport({ actor: member, id: mine.id })).ok).toBe(true);
    expect(await prisma.savedReport.count()).toBe(0);
  });

  it("renames case-only duplicates before the unique index", async () => {
    await prisma.$executeRawUnsafe(
      `DROP INDEX IF EXISTS "SavedReport_createdById_lower_name_key"`,
    );
    const base = {
      reportType: "time-activity",
      visibility: "private",
      params: {},
    };
    const first = await prisma.savedReport.create({
      data: {
        ...base,
        name: "October",
        createdById: ownerId,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const second = await prisma.savedReport.create({
      data: {
        ...base,
        name: "october",
        createdById: ownerId,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    });
    const third = await prisma.savedReport.create({
      data: {
        ...base,
        name: "OCTOBER",
        createdById: ownerId,
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
      },
    });
    const taken = await prisma.savedReport.create({
      data: {
        ...base,
        name: "October (2)",
        createdById: ownerId,
        createdAt: new Date("2026-01-04T00:00:00.000Z"),
      },
    });
    const otherUser = await prisma.savedReport.create({
      data: {
        ...base,
        name: "october",
        createdById: adminId,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const weekly = await prisma.savedReport.create({
      data: {
        ...base,
        name: "Weekly",
        createdById: ownerId,
        createdAt: new Date("2026-01-05T00:00:00.000Z"),
      },
    });
    const weeklyLater = await prisma.savedReport.create({
      data: {
        ...base,
        name: "weekly",
        createdById: ownerId,
        createdAt: new Date("2026-01-06T00:00:00.000Z"),
      },
    });
    const longKept = "L".repeat(78);
    const longDupe = "l".repeat(78);
    await prisma.savedReport.create({
      data: {
        ...base,
        name: longKept,
        createdById: ownerId,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    });
    const longLater = await prisma.savedReport.create({
      data: {
        ...base,
        name: longDupe,
        createdById: ownerId,
        createdAt: new Date("2026-02-02T00:00:00.000Z"),
      },
    });

    try {
      await dedupeSavedReportNames();
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "SavedReport_createdById_lower_name_key" ON "SavedReport" ("createdById", lower("name"))`,
      );

      const names = await prisma.savedReport.findMany({
        where: {
          id: {
            in: [first.id, second.id, third.id, taken.id, otherUser.id, longLater.id, weekly.id, weeklyLater.id],
          },
        },
      });
      const byId = new Map(names.map((row) => [row.id, row.name]));
      expect(byId.get(first.id)).toBe("October");
      expect(byId.get(second.id)).toBe("october (3)");
      expect(byId.get(third.id)).toBe("OCTOBER (4)");
      expect(byId.get(taken.id)).toBe("October (2)");
      expect(byId.get(otherUser.id)).toBe("october");
      expect(byId.get(weekly.id)).toBe("Weekly");
      expect(byId.get(weeklyLater.id)).toBe("weekly (2)");
      expect(byId.get(longLater.id)).toBe(`${"l".repeat(76)} (2)`);
      expect(byId.get(longLater.id)?.length).toBe(80);

      await expect(
        prisma.savedReport.create({
          data: { ...base, name: "OcToBeR", createdById: ownerId },
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "SavedReport_createdById_lower_name_key" ON "SavedReport" ("createdById", lower("name"))`,
      );
    }
  });
});

function dedupeSavedReportNames() {
  const sql = readFileSync(
    path.join(process.cwd(), "prisma/migrations/20261015210000_saved_report_name_ci/migration.sql"),
    "utf8",
  );
  const block = sql.match(/DO \$\$[\s\S]*?\$\$;/)?.[0];
  if (!block) throw new Error("saved report dedupe SQL is missing");
  return prisma.$executeRawUnsafe(block);
}
