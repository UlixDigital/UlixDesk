import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { apiCodes } from "../src/lib/api-errors";
import { SESSION_COOKIE, signSessionCookie } from "../src/lib/session-cookie";
import { timeCopy } from "../src/lib/time-copy";
import { tokenCopy } from "../src/lib/token-copy";
import { e2eEmail, e2ePort, e2eSessionSecret } from "./env";

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

function rawRequest(input: {
  path: string;
  method?: "GET" | "POST";
  host: string;
  headers?: Record<string, string>;
}) {
  return new Promise<{ status: number; body: string; location: string }>((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: e2ePort,
        path: input.path,
        method: input.method ?? "GET",
        headers: { host: input.host, ...input.headers },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            location: response.headers.location ?? "",
          });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

test("rejects an untrusted Host on pages and server actions, and still accepts bearer calls", async () => {
  const evilPage = await rawRequest({ path: "/settings", host: "evil.test:3100" });
  expect(evilPage.status).toBe(403);
  expect(JSON.parse(evilPage.body)).toEqual({
    error: timeCopy.hostDenied,
    code: apiCodes.HOST_FORBIDDEN,
  });

  const evilAction = await rawRequest({
    path: "/settings",
    method: "POST",
    host: "evil.test:3100",
    headers: {
      "next-action": "create-token",
      "content-type": "text/plain;charset=UTF-8",
    },
  });
  expect(evilAction.status).toBe(403);
  expect(JSON.parse(evilAction.body)).toEqual({
    error: timeCopy.hostDenied,
    code: apiCodes.HOST_FORBIDDEN,
  });

  const evilProjects = await rawRequest({ path: "/api/projects", host: "evil.test:3100" });
  expect(evilProjects.status).toBe(403);
  expect(JSON.parse(evilProjects.body)).toEqual({
    error: timeCopy.hostDenied,
    code: apiCodes.HOST_FORBIDDEN,
  });

  for (const path of ["/api/timer", "/api/timer/start", "/api/timer/stop"]) {
    const evilTimer = await rawRequest({ path, host: "evil.test:3100" });
    expect(evilTimer.status).toBe(403);
    expect(JSON.parse(evilTimer.body)).toEqual({
      error: timeCopy.hostForbidden,
      code: apiCodes.HOST_FORBIDDEN,
    });
  }

  const signedOut = await rawRequest({ path: "/settings", host: "127.0.0.1:3100" });
  expect(signedOut.status).toBe(307);
  expect(signedOut.location).toContain("/login");

  const loginPage = await rawRequest({ path: "/login", host: "127.0.0.1:3100" });
  expect(loginPage.status).toBe(200);
  expect(loginPage.body).toContain("Sign in");

  const owner = await prisma.user.findUniqueOrThrow({ where: { email: e2eEmail } });
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.session.create({
    data: {
      userId: owner.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      createdAt: now,
      lastSeenAt: now,
      rotatedAt: now,
    },
  });
  const cookie = `${SESSION_COOKIE}=${await signSessionCookie(token, e2eSessionSecret)}`;

  const loopback = await rawRequest({
    path: "/settings",
    host: "127.0.0.1:3100",
    headers: { cookie },
  });
  expect(loopback.status).toBe(200);
  expect(loopback.body).toContain("Extension access");

  const allowed = await rawRequest({
    path: "/settings",
    host: "desk.example.com",
    headers: { cookie },
  });
  expect(allowed.status).toBe(200);
  expect(allowed.body).toContain("Extension access");

  const bearer = await rawRequest({
    path: "/api/projects",
    host: "evil.test:3100",
    headers: { authorization: `Bearer ulixdesk_${"a".repeat(43)}` },
  });
  expect(bearer.status).toBe(401);
  expect(JSON.parse(bearer.body)).toEqual({
    error: tokenCopy.tokenRejected,
    code: apiCodes.TOKEN_INVALID,
  });
});
