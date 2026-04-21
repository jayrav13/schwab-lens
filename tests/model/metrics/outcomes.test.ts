import { describe, it, expect } from "vitest";
import { computeOutcomes } from "@/lib/model/metrics/outcomes";
import type { Transaction } from "@/lib/csv/types";

function tx(over: Partial<Transaction>): Transaction {
  return {
    tradeDate: "2026-01-05",
    action: "SellToOpen",
    rawAction: "Sell to Open",
    quantity: 1,
    fees: 0,
    amount: 0,
    raw: {} as Transaction["raw"],
    ...over,
  };
}

const opt = (ticker: string, strike: number) => ({
  ticker,
  expiry: "2026-01-09",
  strike,
  type: "Put" as const,
});

describe("computeOutcomes", () => {
  it("counts an expired contract in Expired", () => {
    const rows = computeOutcomes([
      tx({ option: opt("AAA", 10), amount: 50 }),
      tx({
        action: "Expired",
        rawAction: "Expired",
        option: opt("AAA", 10),
        amount: 0,
      }),
    ]);
    expect(rows.find((r) => r.category === "Expired")?.contractCount).toBe(1);
    expect(rows.find((r) => r.category === "Expired")?.grossPremiumImpact).toBe(50);
  });

  it("categorizes BTC at a net profit as ClosedProfit", () => {
    const rows = computeOutcomes([
      tx({ option: opt("BBB", 10), amount: 100 }),
      tx({
        action: "BuyToClose",
        rawAction: "Buy to Close",
        option: opt("BBB", 10),
        amount: -20,
      }),
    ]);
    expect(rows.find((r) => r.category === "ClosedProfit")?.contractCount).toBe(1);
    expect(rows.find((r) => r.category === "ClosedProfit")?.grossPremiumImpact).toBe(80);
  });

  it("categorizes BTC at a net loss as ClosedLoss", () => {
    const rows = computeOutcomes([
      tx({ option: opt("CCC", 10), amount: 30 }),
      tx({
        action: "BuyToClose",
        rawAction: "Buy to Close",
        option: opt("CCC", 10),
        amount: -50,
      }),
    ]);
    expect(rows.find((r) => r.category === "ClosedLoss")?.contractCount).toBe(1);
    expect(rows.find((r) => r.category === "ClosedLoss")?.grossPremiumImpact).toBe(-20);
  });

  it("counts assignments separately", () => {
    const rows = computeOutcomes([
      tx({ option: opt("DDD", 10), amount: 40 }),
      tx({
        action: "Assigned",
        rawAction: "Assigned",
        option: opt("DDD", 10),
        amount: 0,
      }),
    ]);
    expect(rows.find((r) => r.category === "Assigned")?.contractCount).toBe(1);
  });

  it("ignores still-open contracts", () => {
    const rows = computeOutcomes([tx({ option: opt("EEE", 10), amount: 15 })]);
    expect(rows.every((r) => r.contractCount === 0)).toBe(true);
  });
});
