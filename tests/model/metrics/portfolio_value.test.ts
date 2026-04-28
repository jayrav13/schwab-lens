import { describe, it, expect } from "vitest";
import { computePortfolioValueSeries } from "@/lib/model/metrics/portfolio_value";
import type { PortfolioState, Seed } from "@/lib/model/types";
import type { Transaction } from "@/lib/csv/types";

function seed(asOf = "2026-01-01", cash = 10000): Seed {
  return { asOf, cash, initialShares: [], initialOptions: [] };
}

function stateWith(opts: {
  transactions?: Transaction[];
  cashLedger?: { date: string; balance: number }[];
}): PortfolioState {
  return {
    config: {
      seedDate: "2026-01-01",
      seedValue: 10000,
      marketData: { enabled: true },
    },
    transactions: opts.transactions ?? [],
    cashLedger: opts.cashLedger ?? [{ date: "2026-01-01", balance: 10000 }],
    externalFlows: [],
    navSeries: [],
    openOptionPositions: [],
    openSharePositions: [],
    premiumSeries: [],
    premiumTotals: { gross: 0, closed: 0, net: 0 },
    warnings: [],
  };
}

function buyTx(
  date: string,
  ticker: string,
  qty: number,
  price: number,
): Transaction {
  return {
    tradeDate: date,
    action: "Buy",
    ticker,
    quantity: qty,
    price,
    fees: 0,
    amount: -qty * price,
    raw: {
      Date: date,
      Action: "Buy",
      Symbol: ticker,
      Description: "",
      Quantity: String(qty),
      Price: String(price),
      "Fees & Comm": "0",
      Amount: "",
    },
    rawAction: "Buy",
  };
}

function sellTx(
  date: string,
  ticker: string,
  qty: number,
  price: number,
): Transaction {
  return {
    tradeDate: date,
    action: "Sell",
    ticker,
    quantity: qty,
    price,
    fees: 0,
    amount: qty * price,
    raw: {
      Date: date,
      Action: "Sell",
      Symbol: ticker,
      Description: "",
      Quantity: String(qty),
      Price: String(price),
      "Fees & Comm": "0",
      Amount: "",
    },
    rawAction: "Sell",
  };
}

describe("computePortfolioValueSeries", () => {
  it("returns cash-only forward-fill when no shares are ever held", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        cashLedger: [
          { date: "2026-01-01", balance: 10000 },
          { date: "2026-01-03", balance: 9500 },
        ],
      }),
      seed(),
      { ACME: { "2026-01-02": 50, "2026-01-03": 51 } },
      "2026-01-03",
    );

    expect(result.missingTickers).toEqual([]);
    expect(result.series).toEqual([
      { date: "2026-01-02", nav: 10000 },
      { date: "2026-01-03", nav: 9500 },
    ]);
  });

  it("adds shares × close for each date once a Buy happens", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        transactions: [buyTx("2026-01-02", "ACME", 100, 50)],
        cashLedger: [
          { date: "2026-01-01", balance: 10000 },
          { date: "2026-01-02", balance: 5000 },
        ],
      }),
      seed(),
      { ACME: { "2026-01-02": 50, "2026-01-03": 55, "2026-01-04": 60 } },
      "2026-01-04",
    );

    expect(result.missingTickers).toEqual([]);
    expect(result.series).toEqual([
      { date: "2026-01-02", nav: 5000 + 100 * 50 },
      { date: "2026-01-03", nav: 5000 + 100 * 55 },
      { date: "2026-01-04", nav: 5000 + 100 * 60 },
    ]);
  });

  it("reflects a Sell in subsequent dates' share counts", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        transactions: [
          buyTx("2026-01-02", "ACME", 100, 50),
          sellTx("2026-01-03", "ACME", 40, 55),
        ],
        cashLedger: [
          { date: "2026-01-02", balance: 5000 },
          { date: "2026-01-03", balance: 5000 + 40 * 55 },
        ],
      }),
      seed(),
      { ACME: { "2026-01-02": 50, "2026-01-03": 55, "2026-01-04": 60 } },
      "2026-01-04",
    );

    expect(result.series).toEqual([
      { date: "2026-01-02", nav: 5000 + 100 * 50 },
      { date: "2026-01-03", nav: 7200 + 60 * 55 },
      { date: "2026-01-04", nav: 7200 + 60 * 60 },
    ]);
  });

  it("sums across multiple held tickers", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        transactions: [
          buyTx("2026-01-02", "ACME", 100, 10),
          buyTx("2026-01-02", "BETA", 50, 20),
        ],
        cashLedger: [{ date: "2026-01-02", balance: 8000 }],
      }),
      seed(),
      {
        ACME: { "2026-01-03": 12 },
        BETA: { "2026-01-03": 22 },
      },
      "2026-01-03",
    );

    expect(result.series).toEqual([
      { date: "2026-01-03", nav: 8000 + 100 * 12 + 50 * 22 },
    ]);
  });

  it("counts seed.initialShares from the first date in range", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        cashLedger: [{ date: "2026-01-01", balance: 5000 }],
      }),
      {
        asOf: "2026-01-01",
        cash: 5000,
        initialShares: [{ ticker: "ACME", shares: 10, costBasis: 100 }],
        initialOptions: [],
      },
      { ACME: { "2026-01-02": 110 } },
      "2026-01-02",
    );

    expect(result.series).toEqual([
      { date: "2026-01-02", nav: 5000 + 10 * 110 },
    ]);
  });

  it("excludes a ticker's contribution on dates with no close, and surfaces it as missing", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        transactions: [
          buyTx("2026-01-02", "ACME", 100, 10),
          buyTx("2026-01-02", "GAMMA", 50, 20),
        ],
        cashLedger: [{ date: "2026-01-02", balance: 8000 }],
      }),
      seed(),
      {
        ACME: { "2026-01-03": 12 },
      },
      "2026-01-03",
    );

    expect(result.series).toEqual([
      { date: "2026-01-03", nav: 8000 + 100 * 12 },
    ]);
    expect(result.missingTickers).toEqual(["GAMMA"]);
  });

  it("returns an empty series when historicalCloses has no dates", () => {
    const result = computePortfolioValueSeries(
      stateWith({}),
      seed(),
      {},
      "2026-01-05",
    );
    expect(result.series).toEqual([]);
    expect(result.missingTickers).toEqual([]);
  });

  it("bounds the series by [seed.asOf, endDate]", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        cashLedger: [{ date: "2026-01-01", balance: 1000 }],
      }),
      seed("2026-01-02", 1000),
      {
        ACME: {
          "2026-01-01": 1,
          "2026-01-02": 2,
          "2026-01-03": 3,
          "2026-01-05": 5,
        },
      },
      "2026-01-03",
    );

    expect(result.series.map((p) => p.date)).toEqual([
      "2026-01-02",
      "2026-01-03",
    ]);
  });
});
