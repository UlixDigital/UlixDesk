import { mkdir, writeFile } from "node:fs/promises";

const dir = new URL("../env/", import.meta.url);
await mkdir(dir, { recursive: true });

await writeFile(
  new URL("postgres.env", dir),
  [
    "# Generated for a local production-style stack. Not a real secret.",
    "POSTGRES_USER=ulixdesk",
    "POSTGRES_PASSWORD=localpostgrespassword",
    "POSTGRES_DB=postgres",
    "STAGING_DB_PASSWORD=localstagingdb",
    "PRODUCTION_DB_PASSWORD=localproductiondb",
    "",
  ].join("\n"),
);

await writeFile(
  new URL("staging.env", dir),
  [
    "# Local stand-in for staging. Host is staging.desk.localhost.",
    "NODE_ENV=production",
    "DATABASE_URL=postgresql://ulixdesk_staging:localstagingdb@postgres:5432/ulixdesk_staging?connection_limit=5",
    "ULIXDESK_SESSION_SECRET=local-staging-session-secret-32-characters",
    "ULIXDESK_APP_HOSTS=staging.desk.localhost",
    "ULIXDESK_EXTENSION_IDS=cjlaoflbipaehclleojofopapalhiooe",
    "ULIXDESK_TIMER_ORIGINS=",
    "ULIXDESK_PUBLIC_ORIGIN=https://staging.desk.localhost",
    "ULIXDESK_BOOTSTRAP_EMAIL=staging-owner@ulix.local",
    "ULIXDESK_BOOTSTRAP_PASSWORD=staging-owner-password",
    "ULIXDESK_BOOTSTRAP_NAME=Staging Owner",
    "ULIXDESK_MIGRATE_LOCK=8675309",
    "",
  ].join("\n"),
);

await writeFile(
  new URL("production.env", dir),
  [
    "# Local stand-in for production. Host is desk.localhost.",
    "NODE_ENV=production",
    "DATABASE_URL=postgresql://ulixdesk_production:localproductiondb@postgres:5432/ulixdesk_production?connection_limit=5",
    "ULIXDESK_SESSION_SECRET=local-production-session-secret-32-chars",
    "ULIXDESK_APP_HOSTS=desk.localhost",
    "ULIXDESK_EXTENSION_IDS=cjlaoflbipaehclleojofopapalhiooe",
    "ULIXDESK_TIMER_ORIGINS=",
    "ULIXDESK_PUBLIC_ORIGIN=https://desk.localhost",
    "ULIXDESK_BOOTSTRAP_EMAIL=owner@ulix.local",
    "ULIXDESK_BOOTSTRAP_PASSWORD=local-owner-password",
    "ULIXDESK_BOOTSTRAP_NAME=Local Owner",
    "ULIXDESK_MIGRATE_LOCK=8675310",
    "",
  ].join("\n"),
);

console.log("Wrote env/postgres.env, env/staging.env, and env/production.env for local stack testing.");
