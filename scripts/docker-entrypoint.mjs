import { spawn } from "node:child_process";
import { Client } from "pg";

const appUrl = process.env.DATABASE_URL;
if (!appUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
// Migrations stay on the database owner. The app process uses DATABASE_URL,
// which is the non-owner app role once the server env has been switched.
const migrateUrl = process.env.MIGRATE_DATABASE_URL || appUrl;

const lockKey = process.env.ULIXDESK_MIGRATE_LOCK ?? "8675309";
const client = new Client({ connectionString: migrateUrl });
console.log(`Connecting for migrations as ${databaseUser(migrateUrl)}.`);
await client.connect();
// One session holds the lock for the whole migration. A second container waits.
console.log("Waiting for the migration lock.");
await client.query("SELECT pg_advisory_lock($1::bigint)", [lockKey]);
console.log("Applying database migrations.");

try {
  await run("node", ["/opt/migrate/node_modules/prisma/build/index.js", "migrate", "deploy"], migrateUrl);
  console.log("Migrations applied. Checking the first owner.");
  await run("node", ["scripts/bootstrap-owner.mjs"], migrateUrl);
} finally {
  await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockKey]).catch(() => undefined);
  await client.end();
}
console.log(`Starting the app as ${databaseUser(appUrl)}.`);

const server = spawn("node", ["server.js"], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

function databaseUser(url) {
  try {
    return new URL(url).username || "unknown";
  } catch {
    return "unknown";
  }
}

function run(command, args, databaseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code ?? signal}`));
    });
  });
}
