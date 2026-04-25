import { describe, it, expect } from "vitest";
import { parseSchwabTransactions } from "@/lib/brokerage/schwab/transactions";

const SAMPLE = `"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"01/02/2026","Sell to Open","FAKE 01/09/2026 10.00 P","PUT FAKE EXP 01/09/26","1","$1.00","$0.66","$99.34"
"01/03/2026","Journal","","MoneyLink Deposit","","","","$5,000.00"
"01/04/2026","Buy","FAKE","FAKE INC","10","$50.00","$0.00","-$500.00"
`;

const INPUT = {
  filepath: "Demo_XXX999_Transactions_20260105-000000.csv",
  content: SAMPLE,
};

describe("parseSchwabTransactions", () => {
  it("returns one canonical row per CSV row", () => {
    expect(parseSchwabTransactions(INPUT)).toHaveLength(3);
  });

  it("normalizes dates to YYYY-MM-DD", () => {
    const rows = parseSchwabTransactions(INPUT);
    expect(rows.map((r) => r.tradeDate)).toEqual([
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
  });

  it("maps action to canonical and preserves actionRaw", () => {
    const rows = parseSchwabTransactions(INPUT);
    expect(rows[0].actionCanonical).toBe("SELL_TO_OPEN");
    expect(rows[0].actionRaw).toBe("Sell to Open");
    expect(rows[1].actionCanonical).toBe("JOURNAL");
    expect(rows[2].actionCanonical).toBe("BUY");
  });

  it("parses signed amounts", () => {
    const rows = parseSchwabTransactions(INPUT);
    expect(rows[0].amount).toBe(99.34);
    expect(rows[1].amount).toBe(5000);
    expect(rows[2].amount).toBe(-500);
  });

  it("preserves the original CSV row in raw", () => {
    const rows = parseSchwabTransactions(INPUT);
    expect(rows[1].raw).toMatchObject({
      Date: "01/03/2026",
      Action: "Journal",
      Description: "MoneyLink Deposit",
    });
  });

  it("symbol is null when CSV cell is empty", () => {
    const rows = parseSchwabTransactions(INPUT);
    expect(rows[1].symbol).toBeNull();
  });
});
