export type HistoryRange = "7d" | "30d" | "90d" | "all";

export const RANGE_DAYS: Record<Exclude<HistoryRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const RANGE_LABEL: Record<HistoryRange, string> = {
  "7d": "7D",
  "30d": "30D",
  "90d": "90D",
  all: "All",
};

/**
 * Filter already-loaded observations to a date range. The backend exposes no
 * date-range query, so ranges are an honest client-side filter over the
 * loaded rows—not a claim that older rows were fetched.
 */
export function filterByRange<T>(
  entries: T[],
  observedAt: (entry: T) => string,
  range: HistoryRange,
  now = Date.now(),
): T[] {
  if (range === "all") return entries;
  const cutoff = now - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
  return entries.filter((entry) => {
    const time = new Date(observedAt(entry)).getTime();
    return !Number.isNaN(time) && time >= cutoff;
  });
}
