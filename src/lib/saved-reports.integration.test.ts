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
});
