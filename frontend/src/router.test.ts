import { describe, expect, it } from "vitest";
import {
  parseHash,
  parseProductId,
  parseSearchQuery,
  parseTrackedId,
  productHref,
  searchHref,
  trackedHref,
} from "./router";

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

  it("routes the new application sections", () => {
    expect(parseHash("#/search?q=laptop")).toBe("search");
    expect(parseHash("#/dashboard")).toBe("app");
    expect(parseHash("#/tracked/target-1?tab=log")).toBe("tracked");
    expect(parseHash("#/alerts")).toBe("alerts");
    expect(parseHash("#/settings")).toBe("settings");
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

describe("application links", () => {
  it("parses tracked ids, search queries, and link helpers", () => {
    expect(parseTrackedId("#/tracked/target-1?tab=log")).toBe("target-1");
    expect(parseTrackedId("#/app")).toBeNull();
    expect(parseSearchQuery("#/search?q=laptop%20stand")).toBe("laptop stand");
    expect(searchHref("laptop stand")).toBe("#/search?q=laptop%20stand");
    expect(productHref("2626")).toBe("#/product/2626");
    expect(trackedHref("target-1", "log")).toBe("#/tracked/target-1?tab=log");
  });
});
