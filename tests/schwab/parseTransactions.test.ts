import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseTransactions } from "@/lib/schwab/parseTransactions";

function fixture(name: string): string {
  return readFileSync(
    path.join(process.cwd(), "tests", "fixtures", "schwab", name),
    "utf8",
  );
}

describe("parseTransactions", () => {
  it("parses a basic transactions fixture into CanonicalTransaction[]", () => {
    const rows = parseTransactions(fixture("transactions-basic.csv"));
    expect(rows.length).toBeGreaterThan(0);
    const buy = rows.find((r) => r.actionCanonical === "BUY");
    expect(buy).toBeDefined();
    expect(buy?.symbol).toBe("ACME");
    expect(buy?.amount).toBeLessThan(0);
  });

  it("maps unknown actions to UNKNOWN preserving raw", () => {
    const rows = parseTransactions(fixture("transactions-unknown-action.csv"));
    const u = rows.find((r) => r.actionCanonical === "UNKNOWN");
    expect(u).toBeDefined();
    expect(u?.actionRaw).toBe("Mystery");
  });

  it("preserves the raw row in the raw field", () => {
    const rows = parseTransactions(fixture("transactions-basic.csv"));
    expect(rows[0].raw).toEqual(expect.objectContaining({ Date: expect.any(String) }));
  });

  it("normalizes 'as of' dates to YYYY-MM-DD trade_date", () => {
    const rows = parseTransactions(fixture("transactions-as-of.csv"));
    expect(rows[0].tradeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
