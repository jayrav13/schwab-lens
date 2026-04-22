import type { PortfolioState } from "@/lib/model/types";
import type { Quote } from "@/lib/market/quotes";
import type { PositionsSnapshot } from "@/lib/positions/types";

export type MTMRow = {
  ticker: string;
  shares: number;
  costBasis: number;
  marketPrice: number | null;
  marketValue: number;
  unrealized: number;
  unrealizedPct: number;
  quoteAsOf: string | null;
  quoteStale: boolean;
};

export type OptionMTMRow = {
  underlying: string;
  expiry: string;
  strike: number;
  callPut: "C" | "P";
  quantity: number;
  price: number;
  marketValue: number;
  delta: number | null;
  theta: number | null;
  intrinsicValue: number | null;
};

export type MarkToMarket = {
  rows: MTMRow[];
  totalMarketValue: number;
  totalUnrealized: number;
  portfolioValue: number;
  optionsIncomeNav: number;
  cash: number;
  missingQuotes: string[];
  optionRows?: OptionMTMRow[];
};

export function computeMarkToMarket(
  state: PortfolioState,
  quotesByTicker: Record<string, Quote | null>,
  snapshot?: PositionsSnapshot,
): MarkToMarket {
  const snapSharePrice = new Map<string, number>();
  if (snapshot) {
    for (const s of snapshot.shares) snapSharePrice.set(s.ticker, s.price);
  }

  const cash = snapshot
    ? snapshot.cash
    : state.cashLedger.at(-1)?.balance ?? state.config.seedValue;

  const rows: MTMRow[] = [];
  const missingQuotes: string[] = [];

  for (const s of state.openSharePositions) {
    const snapPrice = snapSharePrice.get(s.ticker);
    const quote = quotesByTicker[s.ticker] ?? null;

    let marketPrice: number | null = null;
    let quoteAsOf: string | null = null;
    let quoteStale = false;

    if (snapPrice !== undefined) {
      marketPrice = snapPrice;
      quoteAsOf = snapshot?.asOf ?? null;
      quoteStale = false;
    } else if (quote) {
      marketPrice = quote.price;
      quoteAsOf = quote.asOf;
      quoteStale = quote.stale === true;
    } else {
      missingQuotes.push(s.ticker);
    }

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
      quoteAsOf,
      quoteStale,
    });
  }

  const totalMarketValue = rows.reduce((a, r) => a + r.marketValue, 0);
  const totalCost = state.openSharePositions.reduce(
    (a, s) => a + s.shares * s.weightedCostBasis,
    0,
  );

  const optionRows: OptionMTMRow[] | undefined = snapshot
    ? snapshot.options.map((o) => ({
        underlying: o.underlying,
        expiry: o.expiry,
        strike: o.strike,
        callPut: o.callPut,
        quantity: o.quantity,
        price: o.price,
        marketValue: o.marketValue,
        delta: o.delta,
        theta: o.theta,
        intrinsicValue: o.intrinsicValue,
      }))
    : undefined;

  const optionMarketValue = optionRows
    ? optionRows.reduce((a, r) => a + r.marketValue, 0)
    : 0;

  return {
    rows,
    totalMarketValue,
    totalUnrealized: totalMarketValue - totalCost,
    portfolioValue: cash + totalMarketValue + optionMarketValue,
    optionsIncomeNav: cash + totalCost,
    cash,
    missingQuotes,
    optionRows,
  };
}
