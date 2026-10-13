import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { assignLegacyWorkspaceToOwner } from "./lib/assign-legacy.mjs";

/** Argon2id. Keep this in step with src/lib/password.ts. */
const ARGON2ID = 2;

loadEnvFile(new URL("../.env", import.meta.url));

const prisma = new PrismaClient();

function passwordParams() {
  if (process.env.VITEST === "true") {
    return { algorithm: ARGON2ID, memoryCost: 32, timeCost: 1, parallelism: 1 };
  }
  return { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 };
}

const email = process.env.ULIXDESK_BOOTSTRAP_EMAIL?.trim().toLowerCase() ?? "";
const password = process.env.ULIXDESK_BOOTSTRAP_PASSWORD ?? "";
const name = process.env.ULIXDESK_BOOTSTRAP_NAME?.trim() || "Owner";

try {
  const count = await prisma.user.count();
  if (count === 0) {
    if (!email || !password) {
      console.log(
        "No staff accounts yet. Set ULIXDESK_BOOTSTRAP_EMAIL and ULIXDESK_BOOTSTRAP_PASSWORD, then run npm run user:bootstrap.",
      );
    } else if (password.length < 10) {
      console.error("ULIXDESK_BOOTSTRAP_PASSWORD must be at least 10 characters.");
      process.exitCode = 1;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error("ULIXDESK_BOOTSTRAP_EMAIL must be an email address.");
      process.exitCode = 1;
    } else {
      const owner = await prisma.user.create({
        data: {
          email,
          name,
          role: "owner",
          passwordHash: await hash(password, passwordParams()),
        },
      });
      await assignLegacyWorkspaceToOwner(prisma, owner.id);
      console.log(`Created the owner account ${email}. The password was not printed.`);
    }
  } else {
    const owner = await prisma.user.findFirst({
      where: { role: "owner", deactivatedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (owner) await assignLegacyWorkspaceToOwner(prisma, owner.id);
    console.log("Staff accounts already exist. Any unowned time was assigned to the earliest owner.");
  }
} finally {
  await prisma.$disconnect();
}

function loadEnvFile(url) {
  let text = "";
  try {
    text = readFileSync(url, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
