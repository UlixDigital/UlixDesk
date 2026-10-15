import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createTestUser } from "@/lib/test-actor";

const appUrl = "postgresql://ulixdesk_test_app:testapppassword@127.0.0.1:5432/ulixdesk_test";

async function dropAppRole() {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ulixdesk_test_app') THEN
        EXECUTE 'REVOKE ALL PRIVILEGES ON DATABASE ulixdesk_test FROM ulixdesk_test_app';
        EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ulixdesk_test_app';
        EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ulixdesk_test_app';
        EXECUTE 'REVOKE ALL PRIVILEGES ON SCHEMA public FROM ulixdesk_test_app';
        EXECUTE 'DROP ROLE ulixdesk_test_app';
      END IF;
    END
    $$;
  `);
}

describe("time change privileges", () => {
  afterAll(async () => {
    await dropAppRole().catch(() => undefined);
    await prisma.$disconnect();
  });

  it("lets the app role insert the log and blocks truncate, update, and delete", async () => {
    await resetTestDatabase();
    await dropAppRole();
    const owner = await createTestUser("owner", "role-owner@ulix.test");
    await prisma.timeChange.create({
      data: {
        timeEntryId: "entry-1",
        action: "added",
        source: "web",
        actorId: owner.id,
        entryUserId: owner.id,
      },
    });

    await expect(prisma.$executeRaw`TRUNCATE TABLE "TimeChange"`).rejects.toThrow(/append-only/);

    await prisma.$executeRawUnsafe(`
      CREATE ROLE ulixdesk_test_app LOGIN PASSWORD 'testapppassword'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
    `);
    await prisma.$executeRawUnsafe(`GRANT CONNECT ON DATABASE ulixdesk_test TO ulixdesk_test_app`);
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ulixdesk_test_app`);
    await prisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ulixdesk_test_app`,
    );
    await prisma.$executeRawUnsafe(
      `REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE "TimeChange" FROM ulixdesk_test_app`,
    );

    const role = await prisma.$queryRaw<Array<{ rolsuper: boolean; tableowner: string }>>`
      SELECT r.rolsuper, c.relowner::regrole::text AS tableowner
      FROM pg_roles r, pg_class c
      WHERE r.rolname = 'ulixdesk_test_app' AND c.relname = 'TimeChange'
    `;
    expect(role[0]?.rolsuper).toBe(false);
    expect(role[0]?.tableowner).not.toBe("ulixdesk_test_app");

    const app = new Client({ connectionString: appUrl });
    await app.connect();
    try {
      const seen = await app.query<{ count: string }>(`SELECT count(*)::text AS count FROM "TimeChange"`);
      expect(seen.rows[0]?.count).toBe("1");
      await app.query(
        `INSERT INTO "TimeChange" ("id", "timeEntryId", "action", "source", "actorId", "entryUserId", "changedAt")
         VALUES ('app-row', 'entry-2', 'added', 'web', $1, $1, NOW())`,
        [owner.id],
      );
      await expect(app.query(`UPDATE "TimeChange" SET "action" = 'edited'`)).rejects.toThrow();
      await expect(app.query(`DELETE FROM "TimeChange"`)).rejects.toThrow();
      await expect(app.query(`TRUNCATE TABLE "TimeChange"`)).rejects.toThrow();
      await expect(
        app.query(`ALTER TABLE "TimeChange" DISABLE TRIGGER "time_change_no_delete"`),
      ).rejects.toThrow();
      await app.query(`UPDATE "User" SET "name" = 'Renamed' WHERE "id" = $1`, [owner.id]);
      const renamed = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
      expect(renamed.name).toBe("Renamed");
    } finally {
      await app.end();
    }
  });
});
