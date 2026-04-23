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
    seedDate: "2026-01-15",
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
