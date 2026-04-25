import { describe, it, expect } from "vitest";
import { parseSchwabPositions } from "@/lib/brokerage/schwab/positions";

const SAMPLE = `"Positions for account Demo ...999 as of 09:00 AM ET, 2026/01/05"

"Symbol","Description","Qty (Quantity)","Price","Mkt Val (Market Value)","Cost Basis","Asset Type"
"FAKE","FAKE INC","10","$55.00","$550.00","$500.00","Equity"
"FAKE 01/09/2026 10.00 P","PUT FAKE EXP 01/09/26","-1","$0.50","-$50.00","--","Option"
"Cash & Cash Investments","","","","$4,500.00","","Cash"
"Account Total","","","","$5,000.00","","--"
`;

const INPUT = {
  filepath: "Demo-Positions-2026-01-05-090000.csv",
  content: SAMPLE,
};

describe("parseSchwabPositions", () => {
  it("returns canonical rows with correct as_of (YYYY-MM-DD)", () => {
    const rows = parseSchwabPositions(INPUT);
    for (const r of rows) expect(r.asOf).toBe("2026-01-05");
  });

  it("emits one row per position line; skips totals", () => {
    const rows = parseSchwabPositions(INPUT);
    expect(rows.map((r) => r.symbol)).toEqual([
      "FAKE",
      "FAKE 01/09/2026 10.00 P",
      "Cash & Cash Investments",
    ]);
  });

  it("classifies asset types", () => {
    const rows = parseSchwabPositions(INPUT);
    expect(rows[0].assetType).toBe("equity");
    expect(rows[1].assetType).toBe("option");
    expect(rows[2].assetType).toBe("cash");
  });

  it("parses signed market values", () => {
    const rows = parseSchwabPositions(INPUT);
    expect(rows[0].marketValue).toBe(550);
    expect(rows[1].marketValue).toBe(-50);
    expect(rows[2].marketValue).toBe(4500);
  });

  it("preserves raw row data", () => {
    const rows = parseSchwabPositions(INPUT);
    expect(rows[0].raw).toMatchObject({ Symbol: "FAKE", "Asset Type": "Equity" });
  });

  it("throws when first line is not a Schwab Positions header", () => {
    expect(() =>
      parseSchwabPositions({ filepath: "x.csv", content: "not a header\n\nSymbol\n" }),
    ).toThrow(/as of/i);
  });
});
