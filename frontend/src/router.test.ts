import { describe, expect, it } from "vitest";
import { parseHash, parseProductId } from "./router";

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

  it("routes the product quick view with and without an id", () => {
    expect(parseHash("#/product/tgt_123")).toBe("product");
    expect(parseHash("#/product")).toBe("product");
  });
});

describe("parseProductId", () => {
  it("extracts the target id from a product hash", () => {
    expect(parseProductId("#/product/tgt_123")).toBe("tgt_123");
    expect(parseProductId("#/product/tgt_123?tab=log")).toBe("tgt_123");
  });

  it("returns null everywhere else", () => {
    expect(parseProductId("#/app")).toBeNull();
    expect(parseProductId("#/product")).toBeNull();
    expect(parseProductId("")).toBeNull();
  });
});
