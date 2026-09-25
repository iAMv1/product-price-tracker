/** Shared runtime guards: one copy, imported everywhere. */

/** Plain-object narrowing for parsed JSON bodies. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Single error-to-message funnel (replaces 8 inline copies). */
export function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
