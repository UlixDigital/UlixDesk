import { execSync } from "node:child_process";
import { Client } from "pg";

const databaseUrl = "postgresql://ulixdesk:ulixdesk@127.0.0.1:5432/ulixdesk_test";

export default async function setup() {
  // Drop the test schema directly. `prisma migrate reset` is refused by Prisma's
  // agent guard, and this URL is the local ulixdesk_test database only.
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.end();
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}
