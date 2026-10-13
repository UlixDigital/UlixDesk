import { describe, expect, it } from "vitest";
import { dosDateTime, writeDosDateTime } from "../dos-date.mjs";

describe("zip DOS timestamps", () => {
  it("encodes the build time instead of the empty 1980-00-00 fields", () => {
    const builtAt = new Date(2026, 9, 10, 8, 6, 7);
    expect(dosDateTime(builtAt)).toEqual({
      dosTime: (8 << 11) | (6 << 5) | 3,
      dosDate: ((2026 - 1980) << 9) | (10 << 5) | 10,
    });

    const header = Buffer.alloc(16);
    writeDosDateTime(header, 10, builtAt);
    expect(header.readUInt16LE(10)).toBe((8 << 11) | (6 << 5) | 3);
    expect(header.readUInt16LE(12)).toBe(((2026 - 1980) << 9) | (10 << 5) | 10);
    expect(header.readUInt16LE(10)).not.toBe(0);
    expect(header.readUInt16LE(12)).not.toBe(0);
  });
});
