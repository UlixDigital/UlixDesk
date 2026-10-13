export const e2eDatabaseUrl = "postgresql://ulixdesk:ulixdesk@127.0.0.1:5432/ulixdesk_e2e";
export const e2eOrigin = "http://127.0.0.1:3100";
export const e2ePort = 3100;
export const e2eEmail = "owner@ulix.test";
export const e2ePassword = "e2e-password-10";
export const e2eSessionSecret = "e2e-session-secret-at-least-32-characters";

process.env.DATABASE_URL = e2eDatabaseUrl;
