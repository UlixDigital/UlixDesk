import { spawn } from "node:child_process";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const lockKey = process.env.ULIXDESK_MIGRATE_LOCK ?? "8675309";
const client = new Client({ connectionString: databaseUrl });
console.log("Connecting to the database.");
await client.connect();
// One session holds the lock for the whole migration. A second container waits.
console.log("Waiting for the migration lock.");
await client.query("SELECT pg_advisory_lock($1::bigint)", [lockKey]);
console.log("Applying database migrations.");

try {
  await run("node", ["/opt/migrate/node_modules/prisma/build/index.js", "migrate", "deploy"]);
  console.log("Migrations applied. Checking the first owner.");
  await run("node", ["scripts/bootstrap-owner.mjs"]);
} finally {
  await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockKey]).catch(() => undefined);
  await client.end();
}

const server = spawn("node", ["server.js"], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code ?? signal}`));
    });
  });
}
