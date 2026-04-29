import { describe, it, expect } from "vitest";
import { routeFile } from "@/lib/schwab/filenames";

describe("routeFile", () => {
  it("classifies a Transactions filename", () => {
    expect(routeFile("Demo_XXX100_Transactions_20260427-090135.csv")).toEqual({
      kind: "transactions",
    });
  });

  it("classifies a Positions filename", () => {
    expect(routeFile("Demo-Positions-2026-04-25-123847.csv")).toEqual({
      kind: "positions",
    });
  });

  it("returns null for non-matching filenames", () => {
    expect(routeFile("random.csv")).toBeNull();
    expect(routeFile("Demo-Positions.csv")).toBeNull();
  });

  it("matches transactions even with full path prefix", () => {
    expect(
      routeFile("/some/path/Demo_XXX100_Transactions_20260427-090135.csv"),
    ).toEqual({ kind: "transactions" });
  });
});
