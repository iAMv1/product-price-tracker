/** Small pure formatters with tests (countdown chip, run labels). */
export function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "due now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "due now";
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `in ${hours}h` : `in ${hours}h ${rest}m`;
}

export function nextScrapeIn(
  lastAttemptedAt: string | null | undefined,
  intervalHours: number | undefined,
  now: number = Date.now(),
): string {
  if (!lastAttemptedAt) return "never scraped";
  const last = Date.parse(lastAttemptedAt);
  if (!Number.isFinite(last)) return "schedule unknown";
  const interval = Number.isInteger(intervalHours) ? (intervalHours as number) : 2;
  return formatCountdown(last + interval * 3600 * 1000 - now);
}
