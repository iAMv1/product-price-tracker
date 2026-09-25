import { describe, expect, it } from "vitest";
import { formatCountdown, nextScrapeIn } from "./format";

describe("formatCountdown", () => {
  it("names due states", () => {
    expect(formatCountdown(0)).toBe("due now");
    expect(formatCountdown(-5)).toBe("due now");
    expect(formatCountdown(30_000)).toBe("due now");
    expect(formatCountdown(5 * 60000)).toBe("in 5m");
    expect(formatCountdown(2 * 3600 * 1000)).toBe("in 2h");
    expect(formatCountdown(90 * 60000)).toBe("in 1h 30m");
  });
});

describe("nextScrapeIn", () => {
  it("handles missing and malformed inputs", () => {
    expect(nextScrapeIn(null, 2)).toBe("never scraped");
    expect(nextScrapeIn("nope", 2)).toBe("schedule unknown");
  });

  it("computes from last attempt plus interval", () => {
    const last = new Date("2026-09-25T18:00:00Z").getTime();
    const now = new Date("2026-09-25T19:00:00Z").getTime();
    expect(nextScrapeIn(new Date(last).toISOString(), 2, now)).toBe("in 1h");
    expect(nextScrapeIn(new Date(last).toISOString(), 1, now)).toBe("due now");
  });
});
