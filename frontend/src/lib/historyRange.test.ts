import { describe, expect, it } from "vitest";
import { filterByRange } from "./historyRange";

const NOW = new Date("2026-09-27T00:00:00Z").getTime();

describe("filterByRange", () => {
  it("keeps only loaded rows inside the selected window", () => {
    const entries = [
      { at: "2026-09-26T12:00:00Z" },
      { at: "2026-09-10T12:00:00Z" },
      { at: "2026-06-01T12:00:00Z" },
      { at: "not-a-date" },
    ];
    expect(filterByRange(entries, (entry) => entry.at, "7d", NOW)).toEqual([
      { at: "2026-09-26T12:00:00Z" },
    ]);
    expect(filterByRange(entries, (entry) => entry.at, "30d", NOW)).toHaveLength(2);
    expect(filterByRange(entries, (entry) => entry.at, "all", NOW)).toHaveLength(4);
  });
});
