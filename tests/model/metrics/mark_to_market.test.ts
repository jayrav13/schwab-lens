import { describe, it, expect } from "vitest";
import { computeMarkToMarket } from "@/lib/model/metrics/mark_to_market";
import type { PortfolioState } from "@/lib/model/types";
import type { PositionsSnapshot } from "@/lib/positions/types";

function stateWith(shares: { ticker: string; qty: number; cost: number }[]): PortfolioState {
  return {
    config: { seedDate: "2026-01-15", seedValue: 10000, marketData: { enabled: true } },
    transactions: [],
    cashLedger: [{ date: "2026-03-01", balance: 5000 }],
    externalFlows: [],
    navSeries: [{ date: "2026-03-01", nav: 10000 }],
    openOptionPositions: [],
    openSharePositions: shares.map((s) => ({
      ticker: s.ticker,
      shares: s.qty,
      weightedCostBasis: s.cost,
    })),
    premiumSeries: [],
    premiumTotals: { gross: 0, closed: 0, net: 0 },
    warnings: [],
  };
}

describe("computeMarkToMarket", () => {
  it("computes market value and unrealized P&L from current quotes", () => {
    const state = stateWith([{ ticker: "AAA", qty: 100, cost: 20 }]);
    const mtm = computeMarkToMarket(state, {
      AAA: { ticker: "AAA", price: 25, asOf: "2026-03-01T12:00:00Z" },
    });
    expect(mtm.rows[0].marketValue).toBe(2500);
    expect(mtm.rows[0].unrealized).toBe(500);
    expect(mtm.rows[0].unrealizedPct).toBe(0.25);
    expect(mtm.portfolioValue).toBe(5000 + 2500);
    expect(mtm.optionsIncomeNav).toBe(5000 + 2000);
  });

  it("falls back to cost basis for tickers with no quote", () => {
    const state = stateWith([
      { ticker: "AAA", qty: 100, cost: 20 },
      { ticker: "BBB", qty: 50, cost: 40 },
    ]);
    const mtm = computeMarkToMarket(state, {
      AAA: { ticker: "AAA", price: 25, asOf: "2026-03-01T12:00:00Z" },
    });
    expect(mtm.missingQuotes).toEqual(["BBB"]);
    const bbb = mtm.rows.find((r) => r.ticker === "BBB")!;
    expect(bbb.marketPrice).toBe(null);
    expect(bbb.marketValue).toBe(50 * 40);
    expect(bbb.unrealized).toBe(0);
  });

  it("flags stale quotes on each row", () => {
    const state = stateWith([{ ticker: "AAA", qty: 100, cost: 20 }]);
    const mtm = computeMarkToMarket(state, {
      AAA: { ticker: "AAA", price: 25, asOf: "...", stale: true },
    });
    expect(mtm.rows[0].quoteStale).toBe(true);
  });

  it("returns zero rows when no shares are held", () => {
    const state = stateWith([]);
    const mtm = computeMarkToMarket(state, {});
    expect(mtm.rows).toEqual([]);
    expect(mtm.portfolioValue).toBe(5000);
    expect(mtm.optionsIncomeNav).toBe(5000);
  });
});

describe("computeMarkToMarket — with snapshot", () => {
  const snapshot: PositionsSnapshot = {
    asOf: "2026-03-10T09:00",
    cash: 7777,
    totalValue: 12777,
    shares: [
      { ticker: "AAA", quantity: 100, price: 30, marketValue: 3000, costBasis: 20 },
    ],
    options: [
      {
        underlying: "AAA",
        expiry: "2026-04-17",
        strike: 35,
        callPut: "C",
        quantity: -1,
        price: 0.5,
        marketValue: -50,
        delta: 0.2,
        theta: -0.01,
        intrinsicValue: 0,
      },
    ],
    sourceFile: "t.csv",
  };

  it("prefers snapshot share price over yfinance quote", () => {
    const state = stateWith([{ ticker: "AAA", qty: 100, cost: 20 }]);
    const mtm = computeMarkToMarket(
      state,
      { AAA: { ticker: "AAA", price: 25, asOf: "2026-03-10T09:00:00Z" } },
      snapshot,
    );
    const row = mtm.rows.find((r) => r.ticker === "AAA")!;
    expect(row.marketPrice).toBe(30);
    expect(row.marketValue).toBe(3000);
  });

  it("uses snapshot cash instead of cash ledger final when snapshot provided", () => {
    const state = stateWith([{ ticker: "AAA", qty: 100, cost: 20 }]);
    const mtm = computeMarkToMarket(
      state,
      { AAA: { ticker: "AAA", price: 25, asOf: "2026-03-10T09:00:00Z" } },
      snapshot,
    );
    expect(mtm.cash).toBe(7777);
  });

  it("exposes option rows from snapshot", () => {
    const state = stateWith([]);
    const mtm = computeMarkToMarket(state, {}, snapshot);
    expect(mtm.optionRows).toHaveLength(1);
    expect(mtm.optionRows![0]).toMatchObject({
      underlying: "AAA",
      strike: 35,
      callPut: "C",
      quantity: -1,
      price: 0.5,
      marketValue: -50,
    });
  });

  it("falls back to yfinance for shares missing from snapshot", () => {
    const state = stateWith([
      { ticker: "AAA", qty: 100, cost: 20 },
      { ticker: "BBB", qty: 50, cost: 40 },
    ]);
    const mtm = computeMarkToMarket(
      state,
      { BBB: { ticker: "BBB", price: 42, asOf: "2026-03-10T09:00:00Z" } },
      snapshot,
    );
    const bbb = mtm.rows.find((r) => r.ticker === "BBB")!;
    expect(bbb.marketPrice).toBe(42);
  });
});
