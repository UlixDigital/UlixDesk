import { describe, expect, it } from "vitest";
import { serializeProject, serializeTimer } from "@/lib/time-api";
import { zonedDateTimeToUtc, zonedDayEnd, zonedDayStart } from "@/lib/time-zone";
import {
  attachRates,
  moneyExportFields,
  pickRate,
  portionAmount,
  rateCovers,
  type BillRateRecord,
} from "@/lib/rates";

function rate(overrides: Partial<BillRateRecord> & Pick<BillRateRecord, "id" | "scope">): BillRateRecord {
  return {
    clientId: "client-1",
    projectId: null,
    userId: null,
    amountMinor: 5000,
    currency: "USD",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const COLOMBO = "Asia/Colombo";

const entry = {
  projectId: "project-1",
  clientId: "client-1",
  userId: "user-1",
  startedAt: new Date("2026-02-01T00:00:00.000Z"),
};

function at(date: string, time: string, timeZone: string) {
  const instant = zonedDateTimeToUtc(date, time, timeZone);
  if (!instant) throw new Error(`${date} ${time} does not exist in ${timeZone}`);
  return instant;
}

describe("rate effective dates", () => {
  const january = rate({ id: "jan", scope: "client", amountMinor: 5000 });
  const february = rate({
    id: "feb",
    scope: "client",
    amountMinor: 8000,
    effectiveFrom: new Date("2026-02-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-15T00:00:00.000Z"),
  });

  it("starts a Colombo rate at local midnight, including times that are still the previous UTC day", () => {
    const justBefore = new Date(at("2026-02-01", "00:00", COLOMBO).getTime() - 1);
    const midnight = at("2026-02-01", "00:00", COLOMBO);
    const threeAm = at("2026-02-01", "03:00", COLOMBO);
    expect(justBefore.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(midnight.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(threeAm.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(rateCovers(february.effectiveFrom, justBefore, COLOMBO)).toBe(false);
    expect(rateCovers(february.effectiveFrom, midnight, COLOMBO)).toBe(true);
    expect(rateCovers(february.effectiveFrom, threeAm, COLOMBO)).toBe(true);
    expect(pickRate([january, february], { ...entry, startedAt: justBefore }, COLOMBO)?.id).toBe("jan");
    expect(pickRate([january, february], { ...entry, startedAt: midnight }, COLOMBO)?.id).toBe("feb");
    expect(pickRate([january, february], { ...entry, startedAt: threeAm }, COLOMBO)?.id).toBe("feb");
  });

  it("uses the offset on each side of a New York spring-forward midnight", () => {
    const zone = "America/New_York";
    const justBefore = new Date(at("2026-03-08", "00:00", zone).getTime() - 1);
    const midnight = at("2026-03-08", "00:00", zone);
    const threeAm = at("2026-03-08", "03:00", zone);
    const march = rate({
      id: "mar",
      scope: "client",
      amountMinor: 9000,
      effectiveFrom: new Date("2026-03-08T00:00:00.000Z"),
    });
    expect(midnight.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(threeAm.toISOString()).toBe("2026-03-08T07:00:00.000Z");
    expect(zonedDayEnd("2026-03-08", zone).getTime() - zonedDayStart("2026-03-08", zone).getTime()).toBe(
      23 * 3_600_000,
    );
    expect(rateCovers(march.effectiveFrom, justBefore, zone)).toBe(false);
    expect(rateCovers(march.effectiveFrom, midnight, zone)).toBe(true);
    expect(rateCovers(march.effectiveFrom, threeAm, zone)).toBe(true);
    expect(pickRate([january, march], { ...entry, startedAt: justBefore }, zone)?.id).toBe("jan");
    expect(pickRate([january, march], { ...entry, startedAt: threeAm }, zone)?.id).toBe("mar");
  });

  it("uses the latest save when two rates share an effective date", () => {
    const first = rate({ id: "a", scope: "client", amountMinor: 1000, createdAt: new Date("2026-01-02T00:00:00.000Z") });
    const second = rate({
      id: "b",
      scope: "client",
      amountMinor: 2000,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
    });
    expect(pickRate([first, second], entry, COLOMBO)?.id).toBe("b");
  });
});

describe("rate precedence", () => {
  const client = rate({ id: "client", scope: "client", amountMinor: 1000 });
  const member = rate({
    id: "member",
    scope: "member",
    userId: "user-1",
    amountMinor: 2000,
    currency: "USD",
  });
  const project = rate({
    id: "project",
    scope: "project",
    projectId: "project-1",
    amountMinor: 3000,
  });

  it("prefers the project rate, then the member rate, then the client rate", () => {
    expect(pickRate([client, member, project], entry, COLOMBO)?.id).toBe("project");
    expect(pickRate([client, member], entry, COLOMBO)?.id).toBe("member");
    expect(pickRate([client], entry, COLOMBO)?.id).toBe("client");
  });

  it("does not use another member's rate or another client's rate", () => {
    const otherMember = rate({ id: "other", scope: "member", userId: "user-2", amountMinor: 9000 });
    const otherClient = rate({ id: "else", scope: "client", clientId: "client-2", amountMinor: 9000 });
    expect(pickRate([otherMember, otherClient], entry, COLOMBO)).toBeNull();
    expect(pickRate([client], { ...entry, clientId: null, userId: null }, COLOMBO)).toBeNull();
  });

  it("keeps a project rate when the entry has no client", () => {
    expect(pickRate([project, client], { ...entry, clientId: null }, COLOMBO)?.id).toBe("project");
  });
});

describe("billable amounts and visibility", () => {
  const usd = { amountMinor: 5000, currency: "USD" };

  it("bills only when the project and the entry are both billable", () => {
    expect(
      portionAmount({ projectBillable: true, entryBillable: true, durationMs: 3_600_000, rate: usd }),
    ).toEqual({ currency: "USD", amountMinor: 5000 });
    expect(
      portionAmount({ projectBillable: false, entryBillable: true, durationMs: 3_600_000, rate: usd }),
    ).toBeNull();
    expect(
      portionAmount({ projectBillable: true, entryBillable: false, durationMs: 3_600_000, rate: usd }),
    ).toBeNull();
    expect(
      portionAmount({ projectBillable: true, entryBillable: true, durationMs: 3_600_000, rate: null }),
    ).toBeNull();
    expect(
      portionAmount({
        projectBillable: true,
        entryBillable: true,
        durationMs: 3_600_000,
        rate: { amountMinor: 0, currency: "USD" },
      }),
    ).toEqual({ currency: "USD", amountMinor: 0 });
  });

  it("hides every rate and export amount from members", () => {
    const rows = attachRates("member", [entry], [rate({ id: "client", scope: "client" })], COLOMBO);
    expect(rows[0].rate).toBeNull();
    expect(moneyExportFields("member", { currency: "USD", amountMinor: 5000 })).toEqual({});
    const visible = attachRates("admin", [entry], [rate({ id: "client", scope: "client" })], COLOMBO);
    expect(visible[0].rate).toEqual({ amountMinor: 5000, currency: "USD" });
    expect(moneyExportFields("owner", { currency: "USD", amountMinor: 5000 })).toEqual({
      currency: "USD",
      amountMinor: 5000,
    });
  });

  it("keeps money out of the extension project and timer payloads", () => {
    const project = JSON.stringify(
      serializeProject({
        id: "p",
        name: "Website",
        billable: true,
        clientId: "c",
        clientName: "Acme",
      }),
    );
    const timer = JSON.stringify(
      serializeTimer({
        id: "t",
        projectId: "p",
        userId: "u",
        startedAt: new Date("2026-10-09T09:00:00.000Z"),
        endedAt: null,
        billable: true,
        note: null,
        source: "timer",
        project: {
          id: "p",
          name: "Website",
          billable: true,
          archivedAt: null,
          client: { id: "c", name: "Acme", archivedAt: null },
        },
      }),
    );
    expect(project).not.toMatch(/amount|currency|rate/i);
    expect(timer).not.toMatch(/amount|currency|rate/i);
  });
});
