import { chooseSeed } from "@/lib/positions/seed";
import { buildPortfolio } from "@/lib/model/portfolio";
import { fetchQuotes, type Quote } from "@/lib/market/quotes";
import { loadHistoricalCloses } from "@/lib/market/historical";
import { computePortfolioValueSeries } from "@/lib/model/metrics/portfolio_value";
import { computeMarkToMarket, type MarkToMarket } from "@/lib/model/metrics/mark_to_market";
import type { Config, PortfolioState, Seed } from "@/lib/model/types";
import type { PositionsSnapshot } from "@/lib/positions/types";
import { yesterdayInET } from "@/lib/util/dates";
import { loadDashboardSource, openProductionDb } from "@/lib/server/dashboardSource";

export type DashboardData =
  | {
      kind: "ready";
      state: PortfolioState;
      sourceFiles: { transactions: string[]; positions: string[] };
      loadedAt: string;
      markToMarket: MarkToMarket | null;
      latestSnapshot: PositionsSnapshot | null;
    }
  | { kind: "no-csv"; dataDir: string }
  | { kind: "no-config"; dataDir: string }
  | { kind: "parse-error"; message: string };

export type LoadDashboardOptions = {
  includeMarketData?: boolean;
  dataDir?: string;
  migrationsDir?: string;
};

export async function loadDashboard(
  options: LoadDashboardOptions = {},
): Promise<DashboardData> {
  const includeMarketData = options.includeMarketData ?? true;
  const db = openProductionDb(options.dataDir, options.migrationsDir);

  try {
    const sourced = loadDashboardSource(db);
    if (sourced.kind === "no-primary-account" || sourced.kind === "primary-account-not-found") {
      return { kind: "no-config", dataDir: "(db)" };
    }
    const { account, transactions, earliestSnapshot, latestSnapshot, marketDataEnabled } = sourced.source;

    if (transactions.length === 0 && earliestSnapshot === null) {
      return { kind: "no-csv", dataDir: "(db)" };
    }

    if (account.seedDate === null || account.seedValue === null) {
      return { kind: "no-config", dataDir: "(db)" };
    }

    const config: Config = {
      seedDate: account.seedDate,
      seedValue: account.seedValue,
      marketData: { enabled: marketDataEnabled },
      benchmark: account.benchmark ?? undefined,
    };

    const seed = chooseSeed({
      transactions,
      earliestSnapshot,
      seedDate: account.seedDate,
      seedValue: account.seedValue,
    });

    const state = buildPortfolio(transactions, config, seed);

    if (includeMarketData && marketDataEnabled) {
      const heldTickers = collectHeldTickers(state, seed);
      if (heldTickers.length > 0) {
        const endDate = yesterdayInET();
        if (endDate >= seed.asOf) {
          const historicalCloses: Record<string, Record<string, number>> = {};
          const fetchFailures: Array<{ ticker: string; reason: string }> = [];

          for (const ticker of heldTickers) {
            const res = await loadHistoricalCloses(ticker, seed.asOf, endDate);
            if (res.kind === "ok") {
              const byDate: Record<string, number> = {};
              for (const { date, close } of res.closes) byDate[date] = close;
              historicalCloses[ticker] = byDate;
            } else {
              fetchFailures.push({ ticker, reason: res.message });
            }
          }

          const pv = computePortfolioValueSeries(state, seed, historicalCloses, endDate);
          state.portfolioValueSeries = pv.series;

          const missingSet = new Set<string>([
            ...fetchFailures.map((f) => f.ticker),
            ...pv.missingTickers,
          ]);
          const reasonByTicker = new Map(fetchFailures.map((f) => [f.ticker, f.reason]));
          for (const ticker of Array.from(missingSet).sort()) {
            state.warnings.push({
              kind: "MissingHistoricalPrices",
              ticker,
              reason:
                reasonByTicker.get(ticker) ??
                "No historical close data available for one or more dates.",
            });
          }

          if (typeof config.benchmark === "string" && config.benchmark.length > 0) {
            const ticker = config.benchmark;
            const res = await loadHistoricalCloses(ticker, seed.asOf, endDate);
            if (res.kind === "ok" && res.closes.length >= 2) {
              const baseline = res.closes[0].close;
              if (baseline > 0 && Number.isFinite(baseline)) {
                state.benchmarkSeries = res.closes.map(({ date, close }) => ({
                  date,
                  nav: state.config.seedValue * (close / baseline),
                }));
                state.benchmarkTicker = ticker;
              } else {
                state.warnings.push({
                  kind: "MissingHistoricalPrices",
                  ticker,
                  reason: "Baseline close is zero or invalid.",
                });
              }
            } else {
              const reason =
                res.kind === "error"
                  ? res.message
                  : "Insufficient historical data to render a benchmark line.";
              state.warnings.push({ kind: "MissingHistoricalPrices", ticker, reason });
            }
          }
        }
      }
    }

    let markToMarket: MarkToMarket | null = null;
    if (
      includeMarketData &&
      marketDataEnabled &&
      (state.openSharePositions.length > 0 || latestSnapshot !== null)
    ) {
      const snapSymbols = new Set((latestSnapshot?.shares ?? []).map((s) => s.ticker));
      const missing = state.openSharePositions
        .map((s) => s.ticker)
        .filter((t) => !snapSymbols.has(t));

      const quoteMap: Record<string, Quote | null> = {};
      if (missing.length > 0) {
        const results = await fetchQuotes(missing);
        for (const r of results) {
          if (r.kind === "ok") quoteMap[r.quote.ticker] = r.quote;
        }
        for (const t of missing) if (!(t in quoteMap)) quoteMap[t] = null;
      }
      markToMarket = computeMarkToMarket(state, quoteMap, latestSnapshot ?? undefined);
    }

    return {
      kind: "ready",
      state,
      sourceFiles: {
        transactions: [],
        positions: latestSnapshot ? [latestSnapshot.sourceFile] : [],
      },
      loadedAt: new Date().toISOString(),
      markToMarket,
      latestSnapshot: includeMarketData ? latestSnapshot : null,
    };
  } catch (err) {
    return { kind: "parse-error", message: err instanceof Error ? err.message : String(err) };
  } finally {
    db.close();
  }
}

function collectHeldTickers(state: PortfolioState, seed: Seed): string[] {
  const tickers = new Set<string>();
  for (const s of seed.initialShares) tickers.add(s.ticker);
  for (const t of state.transactions) {
    if ((t.action === "Buy" || t.action === "Sell") && t.ticker) {
      tickers.add(t.ticker);
    }
  }
  return Array.from(tickers).sort();
}
