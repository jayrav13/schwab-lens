import { describe, it, expect } from "vitest";
import {
  TRANSACTIONS_PATTERNS,
  POSITIONS_PATTERNS,
  classifyFilename,
} from "@/lib/brokerage/schwab/filenames";

describe("Schwab filename patterns", () => {
  it("matches a typical transactions filename", () => {
    expect(
      TRANSACTIONS_PATTERNS.some((re) =>
        re.test("Demo_XXX999_Transactions_20260101-090000.csv"),
      ),
    ).toBe(true);
  });

  it("matches a typical positions filename", () => {
    expect(
      POSITIONS_PATTERNS.some((re) =>
        re.test("Demo-Positions-2026-01-15-090000.csv"),
      ),
    ).toBe(true);
  });

  it("does not match the wrong type", () => {
    expect(
      TRANSACTIONS_PATTERNS.some((re) =>
        re.test("Demo-Positions-2026-01-15-090000.csv"),
      ),
    ).toBe(false);
    expect(
      POSITIONS_PATTERNS.some((re) =>
        re.test("Demo_XXX999_Transactions_20260101-090000.csv"),
      ),
    ).toBe(false);
  });

  it("classifyFilename returns 'transactions' / 'positions' / null", () => {
    expect(classifyFilename("Demo_XXX999_Transactions_20260101-090000.csv"))
      .toBe("transactions");
    expect(classifyFilename("Demo-Positions-2026-01-15-090000.csv"))
      .toBe("positions");
    expect(classifyFilename("randomexport.csv")).toBeNull();
  });

  it("classifyFilename uses basename, not full path", () => {
    expect(classifyFilename("/x/y/Demo_XXX999_Transactions_20260101-090000.csv"))
      .toBe("transactions");
  });
});
