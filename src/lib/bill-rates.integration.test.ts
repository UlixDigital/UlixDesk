import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { saveClientRateAction, saveWorkspaceTimeZoneAction } from "@/app/rates/actions";
import {
  getWorkspaceCurrency,
  getWorkspaceTimeZone,
  listAllBillRates,
  saveClientRate,
  saveMemberRate,
  saveProjectRate,
  setWorkspaceCurrency,
  setWorkspaceTimeZone,
  summarizeBillableMoney,
} from "@/lib/bill-rates";
import { createClient } from "@/lib/clients";
import { prisma } from "@/lib/db";
import { createProject } from "@/lib/projects";
import { rateCodes } from "@/lib/rate-copy";
import { pickRate } from "@/lib/rates";
import { zonedDateTimeToUtc } from "@/lib/time-zone";
import { resetTestDatabase } from "@/lib/reset-test-db";
import { createTestUser, signInAs } from "@/lib/test-actor";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("bill rate storage", () => {
  it("gives a new client the workspace currency and leaves existing time without an amount", async () => {
    expect(await getWorkspaceCurrency()).toBe("USD");
    expect(await getWorkspaceTimeZone()).toBe("Asia/Colombo");
    await setWorkspaceCurrency("LKR");
    const client = await createClient({
      name: "Acme",
      address: null,
      phone: null,
      emails: [],
    });
    expect(client.currency).toBe("LKR");
    const project = await createProject({
      name: "Website",
      description: null,
      clientId: client.id,
      billable: true,
    });
    const user = await createTestUser("member", "worker@ulix.test");
    await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        userId: user.id,
        startedAt: new Date("2026-02-01T09:00:00.000Z"),
        endedAt: new Date("2026-02-01T10:00:00.000Z"),
        billable: true,
        source: "manual",
      },
    });
    expect(await summarizeBillableMoney({ clientId: client.id }, "owner")).toEqual({
      totals: [],
      unrated: true,
    });
    expect(await summarizeBillableMoney({ clientId: client.id }, "member")).toBeNull();
  });

  it("keeps the rate that was in effect, with project over member over client", async () => {
    const owner = await createTestUser("owner", "owner@ulix.test");
    const member = await createTestUser("member", "ada@ulix.test");
    const client = await createClient({
      name: "Acme",
      address: null,
      phone: null,
      emails: [],
      currency: "USD",
    });
    const project = await createProject({
      name: "Website",
      description: null,
      clientId: client.id,
      billable: true,
    });
    expect(
      await saveClientRate({
        clientId: client.id,
        amountRaw: "40",
        effectiveFrom: "2026-01-01",
        createdById: owner.id,
      }),
    ).toEqual({ ok: true });
    expect(
      await saveClientRate({
        clientId: client.id,
        amountRaw: "50",
        effectiveFrom: "2026-02-01",
        createdById: owner.id,
      }),
    ).toEqual({ ok: true });
    expect(
      await saveMemberRate({
        clientId: client.id,
        userId: member.id,
        amountRaw: "70",
        effectiveFrom: "2026-01-01",
        createdById: owner.id,
      }),
    ).toEqual({ ok: true });
    expect(
      await saveProjectRate({
        projectId: project.id,
        amountRaw: "90",
        effectiveFrom: "2026-03-01",
        createdById: owner.id,
      }),
    ).toEqual({ ok: true });

    const rates = await listAllBillRates();
    const zone = "Asia/Colombo";
    const subject = {
      projectId: project.id,
      clientId: client.id,
      userId: member.id,
    };
    const febStart = zonedDateTimeToUtc("2026-02-01", "00:00", zone)!;
    const justBefore = new Date(febStart.getTime() - 1);
    const threeAm = zonedDateTimeToUtc("2026-02-01", "03:00", zone)!;
    expect(threeAm.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(pickRate(rates, { ...subject, startedAt: zonedDateTimeToUtc("2026-01-15", "12:00", zone)! }, zone)?.amountMinor).toBe(
      7000,
    );
    expect(pickRate(rates, { ...subject, startedAt: justBefore }, zone)?.amountMinor).toBe(7000);
    expect(pickRate(rates, { ...subject, startedAt: febStart }, zone)?.amountMinor).toBe(7000);
    expect(pickRate(rates, { ...subject, startedAt: threeAm }, zone)?.amountMinor).toBe(7000);
    expect(pickRate(rates, { ...subject, startedAt: zonedDateTimeToUtc("2026-03-01", "00:00", zone)! }, zone)?.amountMinor).toBe(
      9000,
    );
    expect(pickRate(rates, { ...subject, userId: owner.id, startedAt: justBefore }, zone)?.amountMinor).toBe(4000);
    expect(pickRate(rates, { ...subject, userId: owner.id, startedAt: febStart }, zone)?.amountMinor).toBe(5000);
    expect(pickRate(rates, { ...subject, userId: owner.id, startedAt: threeAm }, zone)?.amountMinor).toBe(5000);

    await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        userId: member.id,
        startedAt: new Date("2026-03-01T09:00:00.000Z"),
        endedAt: new Date("2026-03-01T10:30:00.000Z"),
        billable: true,
        source: "manual",
      },
    });
    expect(await summarizeBillableMoney({ projectId: project.id }, "admin")).toEqual({
      totals: [{ currency: "USD", amountMinor: 13500 }],
      unrated: false,
    });
  });

  it("keeps a saved rate's currency when the client currency changes", async () => {
    const owner = await createTestUser("owner", "rates@ulix.test");
    const client = await createClient({
      name: "Acme",
      address: null,
      phone: null,
      emails: [],
      currency: "USD",
    });
    await saveClientRate({
      clientId: client.id,
      amountRaw: "50",
      effectiveFrom: "2026-01-01",
      createdById: owner.id,
    });
    await prisma.client.update({ where: { id: client.id }, data: { currency: "JPY" } });
    await saveClientRate({
      clientId: client.id,
      amountRaw: "1500",
      effectiveFrom: "2026-04-01",
      createdById: owner.id,
    });
    const rates = await listAllBillRates();
    expect(rates.map((row) => row.currency).sort()).toEqual(["JPY", "USD"]);
  });

  it("refuses a member on the server and does not insert a rate", async () => {
    await signInAs("member", "member-rates@ulix.test");
    const client = await createClient({
      name: "Acme",
      address: null,
      phone: null,
      emails: [],
    });
    const result = await saveClientRateAction(
      { error: null, code: null, notice: null, values: { amount: "", effectiveFrom: "2026-01-01", userId: "" } },
      form({ clientId: client.id, amount: "80", effectiveFrom: "2026-01-01" }),
    );
    expect(result.code).toBe(rateCodes.RATE_FORBIDDEN);
    expect(result.error).toBe("You don't have permission to manage clients and projects.");
    expect(await prisma.billRate.count()).toBe(0);
  });

  it("names the allowed years when a real date is outside 2000 through 2100", async () => {
    const owner = await createTestUser("owner", "dates@ulix.test");
    const client = await createClient({
      name: "Acme",
      address: null,
      phone: null,
      emails: [],
    });
    expect(
      await saveClientRate({
        clientId: client.id,
        amountRaw: "50",
        effectiveFrom: "1999-12-31",
        createdById: owner.id,
      }),
    ).toMatchObject({
      ok: false,
      code: rateCodes.RATE_DATE_INVALID,
      error: "Choose a date from 2000 through 2100.",
    });
    expect(
      await saveClientRate({
        clientId: client.id,
        amountRaw: "50",
        effectiveFrom: "not-a-date",
        createdById: owner.id,
      }),
    ).toMatchObject({
      ok: false,
      error: "Enter the date this rate starts.",
    });
  });

  it("rejects an unknown timezone and lets an owner save a daylight-saving zone", async () => {
    expect(await setWorkspaceTimeZone("Not/AZone")).toMatchObject({
      ok: false,
      code: rateCodes.TIMEZONE_INVALID,
      error: "Choose a timezone, such as Asia/Colombo.",
    });
    expect(await setWorkspaceTimeZone("America/New_York")).toEqual({ ok: true });
    expect(await getWorkspaceTimeZone()).toBe("America/New_York");
    expect(await getWorkspaceCurrency()).toBe("USD");
  });

  it("keeps the previous timezone when a rejected zone is submitted", async () => {
    await signInAs("owner", "zone-owner@ulix.test");
    const result = await saveWorkspaceTimeZoneAction(
      { error: null, code: null, notice: null, timeZone: "Asia/Colombo" },
      form({ timeZone: "Mars/Olympus" }),
    );
    expect(result).toMatchObject({
      code: rateCodes.TIMEZONE_INVALID,
      timeZone: "Asia/Colombo",
    });
    expect(await getWorkspaceTimeZone()).toBe("Asia/Colombo");
  });

  it("refuses a member who tries to change the workspace timezone", async () => {
    await signInAs("member", "zone-member@ulix.test");
    const result = await saveWorkspaceTimeZoneAction(
      { error: null, code: null, notice: null, timeZone: "Asia/Colombo" },
      form({ timeZone: "Europe/London" }),
    );
    expect(result.code).toBe(rateCodes.RATE_FORBIDDEN);
    expect(await getWorkspaceTimeZone()).toBe("Asia/Colombo");
  });

  it("rejects a project rate when the project has no client", async () => {
    const owner = await createTestUser("owner", "solo@ulix.test");
    const project = await createProject({
      name: "Internal",
      description: null,
      clientId: null,
      billable: true,
    });
    const saved = await saveProjectRate({
      projectId: project.id,
      amountRaw: "40",
      effectiveFrom: "2026-01-01",
      createdById: owner.id,
    });
    expect(saved).toMatchObject({ ok: false, code: rateCodes.RATE_CLIENT_REQUIRED });
  });
});

function form(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}
