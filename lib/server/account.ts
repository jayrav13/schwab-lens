import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";
import {
  type Account,
  getAccountByUuid,
} from "@/lib/db/repos/accounts";
import { listTransactionsByAccount } from "@/lib/db/repos/transactions";
import {
  getAllSnapshotsByAccount,
  getEarliestSnapshotDate,
  getLatestSnapshotDate,
  getSnapshotByDate,
} from "@/lib/db/repos/positionSnapshots";
import { fetchQuotes, type Quote } from "@/lib/market/quotes";
import { loadHistoricalCloses } from "@/lib/market/historical";
import {
  positionsSnapshotFromRows,
  transactionFromRow,
} from "@/lib/model/fromDb";
import {
  computeMarkToMarket,
  type MarkToMarket,
} from "@/lib/model/metrics/mark_to_market";
import { computePortfolioValueSeries } from "@/lib/model/metrics/portfolio_value";
import { buildPortfolio } from "@/lib/model/portfolio";
import { chooseSeed } from "@/lib/positions/seed";
import type { Config, PortfolioState, Seed, TwrResult } from "@/lib/model/types";
import type { PositionsSnapshot } from "@/lib/positions/types";
import { yesterdayInET } from "@/lib/util/dates";
import { resolvePeriod, type PeriodKey } from "@/lib/server/period";
import { computeTwr } from "@/lib/model/metrics/twr";
import { navSeriesFromSnapshots } from "@/lib/model/metrics/navSeries";

export type AccountOptionsView =
  | {
      kind: "ready";
      account: Account;
      state: PortfolioState;
      sourceFiles: { transactions: string[]; positions: string[] };
      loadedAt: string;
      latestSnapshot: PositionsSnapshot | null;
      markToMarket: MarkToMarket | null;
      twr: TwrResult;
    }
  | { kind: "no-data"; account: Account };

export interface LoadAccountOptionsViewOpts {
  db?: Database.Database;
  includeMarketData?: boolean;
  period?: PeriodKey;
  today?: string;
}

export async function loadAccountOptionsView(
  uuid: string,
  opts: LoadAccountOptionsViewOpts = {},
): Promise<AccountOptionsView | null> {
  const db = opts.db ?? getDb();

  const account = getAccountByUuid(db, uuid);
  if (!account) return null;

  const txRows = listTransactionsByAccount(db, account.id);
  const transactions = txRows.map(transactionFromRow);

  const earliestSnapDate = getEarliestSnapshotDate(db, account.id);
  const latestSnapDate = getLatestSnapshotDate(db, account.id);
  const earliestSnapshot = earliestSnapDate
    ? positionsSnapshotFromRows(
        earliestSnapDate,
        getSnapshotByDate(db, account.id, earliestSnapDate),
      )
    : null;
  const latestSnapshot = latestSnapDate
    ? positionsSnapshotFromRows(
        latestSnapDate,
        getSnapshotByDate(db, account.id, latestSnapDate),
      )
    : null;

  if (transactions.length === 0 && earliestSnapshot === null) {
    return { kind: "no-data", account };
  }

  const bootstrap: Config = {
    seedDate: account.seedDate ?? "",
    seedValue: account.seedValue ?? 0,
    marketData: { enabled: true },
    benchmark: account.benchmark,
  };

  const seed = chooseSeed({
    transactions,
    earliestSnapshot,
    config: bootstrap,
  });

  const config: Config =
    earliestSnapshot !== null && seed.asOf === earliestSnapshot.asOf.slice(0, 10)
      ? {
          ...bootstrap,
          seedDate: earliestSnapshot.asOf.slice(0, 10),
          seedValue: account.seedValue ?? earliestSnapshot.totalValue,
        }
      : bootstrap;

  const state = buildPortfolio(transactions, config, seed);

  if (config.seedValue === 0 && config.seedDate === "") {
    state.warnings.push({ kind: "MissingSeed" });
  }

  let markToMarket: MarkToMarket | null = null;
  const includeMarket = opts.includeMarketData ?? true;

  if (includeMarket) {
    const heldTickers = collectHeldTickers(state, seed);
    const endDate = yesterdayInET();

    if (heldTickers.length > 0 && endDate >= seed.asOf) {
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
        state.warnings.push({
          kind: "MissingHistoricalPrices",
          ticker,
          reason,
        });
      }
    }

    if (state.openSharePositions.length > 0 || latestSnapshot !== null) {
      const snapSymbols = new Set(
        (latestSnapshot?.shares ?? []).map((s) => s.ticker),
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
        latestSnapshot ?? undefined,
      );
    }
  }

  const today = opts.today ?? yesterdayInET();
  const periodKey = opts.period ?? "All";
  const period = resolvePeriod(periodKey, today, seed.asOf);

  const navPoints = navSeriesFromSnapshots(
    getAllSnapshotsByAccount(db, account.id),
  );

  const twr = computeTwr({
    navPoints,
    transactions: state.transactions,
    period: { from: period.start, to: period.end },
    seed:
      account.seedDate !== null && account.seedValue !== null
        ? { date: account.seedDate, value: account.seedValue }
        : null,
  });

  for (const w of twr.warnings) state.warnings.push(w);

  const txSourceFiles = Array.from(
    new Set(txRows.map((r) => r.source_file)),
  ).sort();
  const posSourceFiles = Array.from(
    new Set(
      [earliestSnapshot?.sourceFile, latestSnapshot?.sourceFile].filter(
        (s): s is string => Boolean(s),
      ),
    ),
  ).sort();

  return {
    kind: "ready",
    account,
    state,
    sourceFiles: { transactions: txSourceFiles, positions: posSourceFiles },
    loadedAt: new Date().toISOString(),
    latestSnapshot,
    markToMarket,
    twr,
  };
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
