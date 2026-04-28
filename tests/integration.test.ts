import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSchwabCsv } from "@/lib/csv/parse";
import { buildPortfolio, seedFromConfig } from "@/lib/model/portfolio";
import { loadDashboard } from "@/lib/server/dashboard";

describe("integration: fake portfolio CSV", () => {
  const csv = readFileSync(
    path.join(__dirname, "fixtures", "fake-portfolio.csv"),
    "utf8",
  );
  const txs = parseSchwabCsv(csv);
  const config = {
    seedDate: "2026-01-01",
    seedValue: 10000,
    marketData: { enabled: false },
  };
  const state = buildPortfolio(txs, config, seedFromConfig(config));

  it("parses all 14 data rows", () => {
    expect(txs.length).toBe(14);
  });

  it("final NAV is $10,637.58 after the complete wheel cycle", () => {
    // $10,000 seed
    // + $49.34 STO put + $78.67 STO puts
    // + $0.25 bank interest
    // − $4,400 put-assignment buy; +$4,400 cost-basis shares = NAV-neutral
    // + $58.68 STO call (covered) + $2.00 dividend
    // − $20.02 BTC call
    // + $68.68 STO new call
    // + $4,799.98 call-assignment sell; −$4,400 cost-basis shares
    // + $500 − $500 external flows (net zero)
    // = $10,637.58
    expect(state.navSeries.at(-1)!.nav).toBeCloseTo(10637.58, 2);
  });

  it("has no open option positions (all closed via BTC / expired / assigned)", () => {
    expect(state.openOptionPositions).toEqual([]);
  });

  it("has no open share positions (shares called away after assignment round-trip)", () => {
    expect(state.openSharePositions).toEqual([]);
  });

  it("net premium is $235.35", () => {
    expect(state.premiumTotals.gross).toBeCloseTo(255.37, 2);
    expect(state.premiumTotals.closed).toBeCloseTo(20.02, 2);
    expect(state.premiumTotals.net).toBeCloseTo(235.35, 2);
  });

  it("external flows net to zero (paired journal + wire)", () => {
    const cumulative = state.externalFlows.reduce(
      (a, f) => a + f.signedAmount,
      0,
    );
    expect(cumulative).toBe(0);
    expect(state.externalFlows).toHaveLength(2);
  });

  it("no warnings (clean history)", () => {
    expect(state.warnings).toEqual([]);
  });
});

describe("loadDashboard", () => {
  it("returns a tagged-union result reflecting local data/ state", async () => {
    const result = await loadDashboard();
    expect(["ready", "no-csv", "no-config", "parse-error"]).toContain(
      result.kind,
    );
  });

  it("exposes closedTrades on PortfolioState when dashboard is ready", async () => {
    const result = await loadDashboard();
    if (result.kind !== "ready") return;

    expect(Array.isArray(result.state.closedTrades)).toBe(true);

    for (const t of result.state.closedTrades ?? []) {
      expect(typeof t.contract.ticker).toBe("string");
      expect(["Put", "Call"]).toContain(t.contract.type);
      expect(typeof t.openDate).toBe("string");
      expect(typeof t.closeDate).toBe("string");
      expect(["Expired", "Assigned", "ClosedProfit", "ClosedLoss"]).toContain(
        t.outcome,
      );
      expect(Number.isFinite(t.netPnL)).toBe(true);
    }
  });

  it("exposes benchmarkSeries when config.benchmark is a non-empty string and marketData is enabled", async () => {
    const result = await loadDashboard();
    if (result.kind !== "ready") return;
    if (!result.state.config.marketData.enabled) return;

    const bench = result.state.config.benchmark;
    if (typeof bench === "string" && bench.length > 0) {
      const warned = result.state.warnings.some(
        (w) => w.kind === "MissingHistoricalPrices" && w.ticker === bench,
      );
      const hasSeries =
        Array.isArray(result.state.benchmarkSeries) &&
        (result.state.benchmarkSeries?.length ?? 0) >= 2 &&
        result.state.benchmarkTicker === bench;
      expect(hasSeries || warned).toBe(true);
    } else {
      expect(result.state.benchmarkSeries).toBeUndefined();
      expect(result.state.benchmarkTicker).toBeUndefined();
    }
  });

  it("exposes portfolioValueSeries when market data is enabled and held tickers exist", async () => {
    const result = await loadDashboard();
    if (result.kind !== "ready") return;

    if (!result.state.config.marketData.enabled) {
      expect(result.state.portfolioValueSeries).toBeUndefined();
      return;
    }

    const anyHeldTicker =
      result.state.openSharePositions.length > 0 ||
      result.state.transactions.some(
        (t) => (t.action === "Buy" || t.action === "Sell") && t.ticker,
      );

    if (anyHeldTicker) {
      const hasSeries =
        Array.isArray(result.state.portfolioValueSeries) &&
        result.state.portfolioValueSeries.length >= 0;
      expect(hasSeries).toBe(true);
    }
  });
});

describe("loadDashboard({ includeMarketData: false })", () => {
  it("skips historical + benchmark + mark-to-market entirely", async () => {
    const result = await loadDashboard({ includeMarketData: false });
    if (result.kind !== "ready") return;

    expect(result.state.portfolioValueSeries).toBeUndefined();
    expect(result.state.benchmarkSeries).toBeUndefined();
    expect(result.state.benchmarkTicker).toBeUndefined();
    expect(result.markToMarket).toBeNull();

    const missing = result.state.warnings.filter(
      (w) => w.kind === "MissingHistoricalPrices",
    );
    expect(missing).toEqual([]);
  });

  it("still returns closedTrades and transactions", async () => {
    const result = await loadDashboard({ includeMarketData: false });
    if (result.kind !== "ready") return;
    expect(Array.isArray(result.state.closedTrades)).toBe(true);
    expect(Array.isArray(result.state.transactions)).toBe(true);
  });
});
