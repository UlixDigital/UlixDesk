import http from "node:http";
import { expect, test } from "@playwright/test";
import { apiCodes } from "../src/lib/api-errors";
import { timeCopy } from "../src/lib/time-copy";
import { tokenCopy } from "../src/lib/token-copy";
import { e2ePort } from "./env";

function rawRequest(input: {
  path: string;
  method?: "GET" | "POST";
  host: string;
  headers?: Record<string, string>;
}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
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
    error: timeCopy.hostForbidden,
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
    error: timeCopy.hostForbidden,
    code: apiCodes.HOST_FORBIDDEN,
  });

  const loopback = await rawRequest({ path: "/settings", host: "127.0.0.1:3100" });
  expect(loopback.status).toBe(200);
  expect(loopback.body).toContain("Extension access");

  const allowed = await rawRequest({ path: "/settings", host: "desk.example.com" });
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
