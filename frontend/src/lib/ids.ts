const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for backend tracked-target UUIDs; numeric store IDs return false. */
export function isUuid(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Monogram derived from a real product name; never a stock photo. */
export function productInitials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join("")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase();
  return letters === "" ? "PT" : letters;
}
