import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadTransactionsFromDir } from "@/lib/csv/load";
import { loadPositionsFromDir, latest, earliest } from "@/lib/positions/load";
import { chooseSeed } from "@/lib/positions/seed";
import { buildPortfolio } from "@/lib/model/portfolio";
import { readConfigFile } from "@/lib/config";
import { fetchQuotes, type Quote } from "@/lib/market/quotes";
import { loadHistoricalCloses } from "@/lib/market/historical";
import { computePortfolioValueSeries } from "@/lib/model/metrics/portfolio_value";
import {
  computeMarkToMarket,
  type MarkToMarket,
} from "@/lib/model/metrics/mark_to_market";
import type { PortfolioState, Seed } from "@/lib/model/types";
import type { PositionsSnapshot } from "@/lib/positions/types";
import { yesterdayInET } from "@/lib/util/dates";

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

export async function loadDashboard(): Promise<DashboardData> {
  const dataDir = path.join(process.cwd(), "data");
  const config = readConfigFile(dataDir);
  if (!config) return { kind: "no-config", dataDir };

  const transactionsDir = path.join(dataDir, "transactions");
  const positionsDir = path.join(dataDir, "positions");

  try {
    const transactions = loadTransactionsFromDir(transactionsDir);
    const snapshots = loadPositionsFromDir(positionsDir);

    if (transactions.length === 0 && snapshots.length === 0) {
      return { kind: "no-csv", dataDir };
    }

    const earliestSnap = earliest(snapshots);
    const latestSnap = latest(snapshots);
    const seed = chooseSeed({
      transactions,
      earliestSnapshot: earliestSnap,
      config,
    });

    const state = buildPortfolio(transactions, config, seed);

    if (config.marketData.enabled) {
      const heldTickers = collectHeldTickers(state, seed);
      if (heldTickers.length > 0) {
        const endDate = yesterdayInET();
        if (endDate >= seed.asOf) {
          const historicalCloses: Record<string, Record<string, number>> = {};
          const fetchFailures: Array<{ ticker: string; reason: string }> = [];

          for (const ticker of heldTickers) {
            const res = await loadHistoricalCloses(
              ticker,
              seed.asOf,
              endDate,
            );
            if (res.kind === "ok") {
              const byDate: Record<string, number> = {};
              for (const { date, close } of res.closes) byDate[date] = close;
              historicalCloses[ticker] = byDate;
            } else {
              fetchFailures.push({ ticker, reason: res.message });
            }
          }

          const pv = computePortfolioValueSeries(
            state,
            seed,
            historicalCloses,
            endDate,
          );

          state.portfolioValueSeries = pv.series;

          const missingSet = new Set<string>([
            ...fetchFailures.map((f) => f.ticker),
            ...pv.missingTickers,
          ]);
          const reasonByTicker = new Map(
            fetchFailures.map((f) => [f.ticker, f.reason]),
          );
          for (const ticker of Array.from(missingSet).sort()) {
            state.warnings.push({
              kind: "MissingHistoricalPrices",
              ticker,
              reason:
                reasonByTicker.get(ticker) ??
                "No historical close data available for one or more dates.",
            });
          }

          if (
            typeof config.benchmark === "string" &&
            config.benchmark.length > 0
          ) {
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
              state.warnings.push({
                kind: "MissingHistoricalPrices",
                ticker,
                reason,
              });
            }
          }
        }
      }
    }

    let markToMarket: MarkToMarket | null = null;
    if (
      config.marketData.enabled &&
      (state.openSharePositions.length > 0 || latestSnap !== null)
    ) {
      const snapSymbols = new Set(
        (latestSnap?.shares ?? []).map((s) => s.ticker),
      );
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
      markToMarket = computeMarkToMarket(
        state,
        quoteMap,
        latestSnap ?? undefined,
      );
    }

    return {
      kind: "ready",
      state,
      sourceFiles: {
        transactions: listCsvFiles(transactionsDir),
        positions: snapshots.map((s) => s.sourceFile),
      },
      loadedAt: new Date().toISOString(),
      markToMarket,
      latestSnapshot: latestSnap,
    };
  } catch (err) {
    return {
      kind: "parse-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function listCsvFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort();
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
