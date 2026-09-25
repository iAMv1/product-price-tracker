import { describe, expect, it } from "vitest";
import { parseHash } from "./router";

describe("parseHash", () => {
  it("routes the known pages", () => {
    expect(parseHash("#/app")).toBe("app");
    expect(parseHash("#/docs")).toBe("docs");
    expect(parseHash("#/changelog")).toBe("changelog");
    expect(parseHash("#/")).toBe("landing");
    expect(parseHash("")).toBe("landing");
  });

  it("falls back to landing for unknown or OAuth-fragment hashes", () => {
    expect(parseHash("#/login")).toBe("landing");
    expect(parseHash("#/nope")).toBe("landing");
    expect(parseHash("#access_token=abc&type=bearer")).toBe("landing");
  });

  it("ignores query strings", () => {
    expect(parseHash("#/app?limit=10")).toBe("app");
  });
});
