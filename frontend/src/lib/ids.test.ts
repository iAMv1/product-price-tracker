import { describe, expect, it } from "vitest";
import { isUuid, productInitials } from "./ids";

describe("isUuid", () => {
  it("distinguishes tracked-target UUIDs from numeric store IDs", () => {
    expect(isUuid("43b93421-e89e-4d5c-8229-549fcc916953")).toBe(true);
    expect(isUuid("2626")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});

describe("productInitials", () => {
  it("uses the first two alphanumeric initials", () => {
    expect(productInitials("Redwick Ukulele Nano")).toBe("RU");
    expect(productInitials("  ")).toBe("PT");
  });
});
