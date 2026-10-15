import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    timeChange: {
      count: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { listTimeChangesForExport, TIME_CHANGE_EXPORT_CAP } from "@/lib/time-changes";

const count = vi.mocked(prisma.timeChange.count);

describe("time change export cap", () => {
  beforeEach(() => {
    count.mockReset();
  });

  it("returns TIME_CHANGE_TOO_LARGE when the count is past the cap", async () => {
    count.mockResolvedValue(TIME_CHANGE_EXPORT_CAP + 1);
    const result = await listTimeChangesForExport({
      actor: { id: "owner", role: "owner" },
      from: new Date("2026-10-01T00:00:00.000Z"),
      to: new Date("2026-10-31T00:00:00.000Z"),
      timeZone: "Asia/Colombo",
      memberId: null,
      clientId: null,
      projectId: null,
      action: null,
    });
    expect(result).toEqual({ ok: false, code: "TIME_CHANGE_TOO_LARGE" });
    expect(count).toHaveBeenCalledOnce();
  });
});
