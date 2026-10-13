import { hash, verify } from "@node-rs/argon2";

/** Argon2id. The package exports this as a const enum, which this project cannot import. */
const ARGON2ID = 2;

/**
 * Argon2id parameters. Tests use a tiny memory cost so the suite stays fast.
 * Production uses the OWASP minimum: 19 MiB, 2 iterations, parallelism 1.
 * Keep scripts/bootstrap-owner.mjs in step with the production numbers.
 */
function passwordParams() {
  if (process.env.VITEST === "true") {
    return {
      algorithm: ARGON2ID,
      memoryCost: 32,
      timeCost: 1,
      parallelism: 1,
    };
  }
  return {
    algorithm: ARGON2ID,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  };
}

export async function hashPassword(password: string) {
  return hash(password, passwordParams());
}

export async function verifyPassword(password: string, passwordHash: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/** A real hash used when the email is unknown, so the failure takes similar time. */
export function dummyPasswordHash() {
  dummyHash ??= hashPassword("ulixdesk-dummy-password");
  return dummyHash;
}
