import { describe, expect, it } from "vitest";
import { deviceLabelFromUserAgent } from "@/lib/device-label";

describe("device labels", () => {
  it("names the browser and the computer without keeping the raw header", () => {
    expect(
      deviceLabelFromUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on Linux");
    expect(
      deviceLabelFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on macOS");
    expect(
      deviceLabelFromUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Edg/120.0.0.0",
      ),
    ).toBe("Edge on Windows");
    expect(deviceLabelFromUserAgent(null)).toBe("Browser on this computer");
  });
});
