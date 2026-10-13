import { execSync } from "node:child_process";

const databaseUrl = "postgresql://ulixdesk:ulixdesk@127.0.0.1:5432/ulixdesk_test";

export default function setup() {
  execSync("npx prisma migrate reset --force --skip-seed", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}
