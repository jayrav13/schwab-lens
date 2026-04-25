import { describe, it, expect } from "vitest";
import { brokerages, findBrokerage, routeFile } from "@/lib/brokerage/registry";

describe("registry", () => {
  it("contains the schwab adapter", () => {
    expect(brokerages.map((b) => b.slug)).toContain("schwab");
  });

  it("findBrokerage returns the adapter by slug", () => {
    expect(findBrokerage("schwab")?.slug).toBe("schwab");
    expect(findBrokerage("does-not-exist")).toBeNull();
  });

  it("routeFile returns brokerage + kind for a transactions filename", () => {
    expect(routeFile("Demo_XXX999_Transactions_20260101-090000.csv")).toEqual({
      brokerage: expect.objectContaining({ slug: "schwab" }),
      kind: "transactions",
    });
  });

  it("routeFile returns brokerage + kind for a positions filename", () => {
    expect(routeFile("Demo-Positions-2026-01-15-090000.csv")).toEqual({
      brokerage: expect.objectContaining({ slug: "schwab" }),
      kind: "positions",
    });
  });

  it("routeFile returns null for unrecognized filenames", () => {
    expect(routeFile("random.csv")).toBeNull();
  });
});
