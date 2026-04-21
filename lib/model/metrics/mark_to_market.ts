import type { PortfolioState } from "@/lib/model/types";
import type { Quote } from "@/lib/market/quotes";

export type MTMRow = {
  ticker: string;
  shares: number;
  costBasis: number;       // $/share
  marketPrice: number | null; // null if quote unavailable
  marketValue: number;     // shares * (marketPrice ?? costBasis)
  unrealized: number;      // marketValue - shares * costBasis
  unrealizedPct: number;   // unrealized / (shares * costBasis)
  quoteAsOf: string | null;
  quoteStale: boolean;
};

export type MarkToMarket = {
  rows: MTMRow[];
  totalMarketValue: number;       // sum of marketValue across rows
  totalUnrealized: number;        // sum of unrealized
  portfolioValue: number;         // cash + totalMarketValue
  optionsIncomeNav: number;       // cash + Σ(shares × cost) — same as NAV series end
  cash: number;
  missingQuotes: string[];        // tickers with no quote at all
};

export function computeMarkToMarket(
  state: PortfolioState,
  quotesByTicker: Record<string, Quote | null>,
): MarkToMarket {
  const cash = state.cashLedger.at(-1)?.balance ?? state.config.seedValue;
  const rows: MTMRow[] = [];
  const missingQuotes: string[] = [];

  for (const s of state.openSharePositions) {
    const q = quotesByTicker[s.ticker] ?? null;
    if (q === null) missingQuotes.push(s.ticker);

    const marketPrice = q?.price ?? null;
    const priceForValue = marketPrice ?? s.weightedCostBasis;
    const costTotal = s.shares * s.weightedCostBasis;
    const marketValue = s.shares * priceForValue;
    const unrealized = marketValue - costTotal;
    const unrealizedPct = costTotal === 0 ? 0 : unrealized / costTotal;

    rows.push({
      ticker: s.ticker,
      shares: s.shares,
      costBasis: s.weightedCostBasis,
      marketPrice,
      marketValue,
      unrealized,
      unrealizedPct,
      quoteAsOf: q?.asOf ?? null,
      quoteStale: q?.stale === true,
    });
  }

  const totalMarketValue = rows.reduce((a, r) => a + r.marketValue, 0);
  const totalCost = state.openSharePositions.reduce(
    (a, s) => a + s.shares * s.weightedCostBasis,
    0,
  );

  return {
    rows,
    totalMarketValue,
    totalUnrealized: totalMarketValue - totalCost,
    portfolioValue: cash + totalMarketValue,
    optionsIncomeNav: cash + totalCost,
    cash,
    missingQuotes,
  };
}
