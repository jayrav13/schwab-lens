import type { NavPoint, PortfolioState, Seed } from "@/lib/model/types";

export function computePortfolioValueSeries(
  state: PortfolioState,
  seed: Seed,
  historicalCloses: Record<string, Record<string, number>>,
  endDate: string,
): { series: NavPoint[]; missingTickers: string[] } {
  const dateSet = new Set<string>();
  for (const closes of Object.values(historicalCloses)) {
    for (const date of Object.keys(closes)) {
      if (date >= seed.asOf && date <= endDate) dateSet.add(date);
    }
  }
  const dates = Array.from(dateSet).sort();

  if (dates.length === 0) {
    return { series: [], missingTickers: [] };
  }

  const cashPoints = [...state.cashLedger].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  function cashAt(date: string): number {
    let balance = seed.cash;
    for (const p of cashPoints) {
      if (p.date > date) break;
      balance = p.balance;
    }
    return balance;
  }

  const sortedTxs = [...state.transactions].sort((a, b) =>
    a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0,
  );
  const sharesByTicker = new Map<string, number>();
  for (const s of seed.initialShares) {
    sharesByTicker.set(s.ticker, s.shares);
  }
  let txIdx = 0;

  const missing = new Set<string>();
  const series: NavPoint[] = [];

  for (const date of dates) {
    while (txIdx < sortedTxs.length && sortedTxs[txIdx].tradeDate <= date) {
      const t = sortedTxs[txIdx];
      if ((t.action === "Buy" || t.action === "Sell") && t.ticker) {
        const prior = sharesByTicker.get(t.ticker) ?? 0;
        const delta = t.action === "Buy" ? t.quantity : -t.quantity;
        sharesByTicker.set(t.ticker, prior + delta);
      }
      txIdx++;
    }

    let sum = cashAt(date);
    for (const [ticker, shares] of sharesByTicker) {
      if (shares <= 0) continue;
      const close = historicalCloses[ticker]?.[date];
      if (typeof close === "number" && Number.isFinite(close)) {
        sum += shares * close;
      } else {
        missing.add(ticker);
      }
    }

    series.push({ date, nav: sum });
  }

  return {
    series,
    missingTickers: Array.from(missing).sort(),
  };
}
