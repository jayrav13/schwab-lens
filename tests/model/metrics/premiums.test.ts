import { describe, it, expect } from "vitest";
import {
  computePremiumSeries,
  computePremiumTotals,
  groupPremiumsByMonth,
} from "@/lib/model/metrics/premiums";
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

describe("premiums", () => {
  it("sums gross STO, closed BTC, and net", () => {
    const { gross, closed, net } = computePremiumTotals([
      tx({ amount: 100 }),
      tx({ action: "BuyToClose", rawAction: "Buy to Close", amount: -30 }),
      tx({ amount: 50 }),
    ]);
    expect(gross).toBe(150);
    expect(closed).toBe(30);
    expect(net).toBe(120);
  });

  it("builds per-date series combining STO + BTC", () => {
    const series = computePremiumSeries([
      tx({ amount: 100, tradeDate: "2026-01-05" }),
      tx({
        action: "BuyToClose",
        rawAction: "Buy to Close",
        amount: -40,
        tradeDate: "2026-01-05",
      }),
      tx({ amount: 50, tradeDate: "2026-02-10" }),
    ]);
    expect(series).toEqual([
      { date: "2026-01-05", netAmount: 60 },
      { date: "2026-02-10", netAmount: 50 },
    ]);
  });

  it("groups premiums by month with gross/closed/net breakdown", () => {
    const months = groupPremiumsByMonth([
      tx({ amount: 100, tradeDate: "2026-01-05" }),
      tx({
        action: "BuyToClose",
        rawAction: "Buy to Close",
        amount: -30,
        tradeDate: "2026-01-20",
      }),
      tx({ amount: 50, tradeDate: "2026-02-10" }),
    ]);
    expect(months).toEqual([
      { month: "2026-01", gross: 100, closed: 30, net: 70 },
      { month: "2026-02", gross: 50, closed: 0, net: 50 },
    ]);
  });
});
