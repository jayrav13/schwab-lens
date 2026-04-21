import { describe, it, expect } from "vitest";
import { computeCashLedger } from "@/lib/model/cash";
import type { Transaction } from "@/lib/csv/types";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    tradeDate: "2026-01-05",
    action: "SellToOpen",
    rawAction: "Sell to Open",
    quantity: 1,
    fees: 0,
    amount: 0,
    raw: {} as Transaction["raw"],
    ...overrides,
  };
}

describe("computeCashLedger", () => {
  it("starts at seed value and applies amounts in order", () => {
    const { cashLedger, finalCash } = computeCashLedger(
      [
        tx({ amount: 100, tradeDate: "2026-01-05" }),
        tx({ amount: -50, tradeDate: "2026-01-08" }),
      ],
      { seedDate: "2026-01-15", seedValue: 12345 },
    );
    expect(cashLedger[0]).toEqual({ date: "2026-01-15", balance: 12345 });
    expect(cashLedger.at(-1)).toEqual({ date: "2026-01-08", balance: 25050 });
    expect(finalCash).toBe(25050);
  });

  it("collapses multiple same-day transactions to a single endpoint", () => {
    const { cashLedger } = computeCashLedger(
      [
        tx({ amount: 10, tradeDate: "2026-01-05" }),
        tx({ amount: 20, tradeDate: "2026-01-05" }),
      ],
      { seedDate: "2026-01-15", seedValue: 100 },
    );
    expect(cashLedger).toEqual([
      { date: "2026-01-15", balance: 100 },
      { date: "2026-01-05", balance: 130 },
    ]);
  });

  it("collects Journal + WireSent into externalFlows and cumulative", () => {
    const { externalFlows, cumulativeExternal } = computeCashLedger(
      [
        tx({
          action: "Journal",
          rawAction: "Journal",
          amount: 5000,
          tradeDate: "2026-02-05",
        }),
        tx({
          action: "WireSent",
          rawAction: "Wire Sent",
          amount: -5000,
          tradeDate: "2026-02-05",
        }),
      ],
      { seedDate: "2026-01-15", seedValue: 12345 },
    );
    expect(externalFlows).toHaveLength(2);
    expect(cumulativeExternal).toBe(0);
  });
});
