import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePositions } from "@/lib/schwab/parsePositions";

function fixture(name: string): string {
  return readFileSync(
    path.join(process.cwd(), "tests", "fixtures", "schwab", name),
    "utf8",
  );
}

describe("parsePositions", () => {
  it("parses an equity + cash positions fixture", () => {
    const rows = parsePositions(fixture("positions-basic.csv"), "f.csv", "2026-04-25");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.find((r) => r.symbol === "ACME")?.assetType).toBe("equity");
    expect(rows.find((r) => r.assetType === "cash")).toBeDefined();
  });

  it("excludes the totals row", () => {
    const rows = parsePositions(fixture("positions-basic.csv"), "f.csv", "2026-04-25");
    expect(rows.find((r) => r.symbol.toLowerCase().includes("total"))).toBeUndefined();
  });

  it("preserves raw fields", () => {
    const rows = parsePositions(fixture("positions-basic.csv"), "f.csv", "2026-04-25");
    expect(rows[0].raw).toBeDefined();
  });

  it("classifies option symbols as 'option' assetType", () => {
    const rows = parsePositions(fixture("positions-with-options.csv"), "f.csv", "2026-04-25");
    expect(rows.find((r) => r.assetType === "option")).toBeDefined();
  });
});
