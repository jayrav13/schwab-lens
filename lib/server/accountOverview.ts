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
  type PositionSnapshotRow,
} from "@/lib/db/repos/positionSnapshots";
import { fetchQuotes, type Quote } from "@/lib/market/quotes";
import { loadHistoricalCloses } from "@/lib/market/historical";
import {
  positionsSnapshotFromRows,
  transactionFromRow,
} from "@/lib/model/fromDb";
import { computePortfolioValueSeries } from "@/lib/model/metrics/portfolio_value";
import { buildPortfolio } from "@/lib/model/portfolio";
import { chooseSeed } from "@/lib/positions/seed";
import type {
  BenchmarkResult,
  Config,
  PortfolioState,
  Seed,
  TwrSegment,
  Warning,
} from "@/lib/model/types";
import type { Transaction } from "@/lib/csv/types";
import { yesterdayInET } from "@/lib/util/dates";
import {
  resolvePeriod,
  type PeriodKey,
} from "@/lib/server/period";
import { computeTwr } from "@/lib/model/metrics/twr";
import { navSeriesFromSnapshots } from "@/lib/model/metrics/navSeries";
import { computeBenchmark } from "@/lib/model/metrics/benchmark";

export type HoldingRow = {
  symbol: string;
  description: string | null;
  qty: number | null;
  avgCost: number | null;
  price: number | null;
  value: number;
  pctOfAccount: number;
  dayChangePct: number | null;
  source: "snapshot" | "live";
};

export type AllocationSlice = { bucket: string; value: number; pct: number };
export type EquityAllocationRow = {
  symbol: string;
  value: number;
  pctOfEquity: number;
};

export type NavStripData = {
  current: number;
  twr: number | null;
  effectiveStart: { date: string; nav: number } | null;
  effectiveEnd: { date: string; nav: number } | null;
  clamped: boolean;
  benchmark: BenchmarkResult | null;
  computation: {
    period: PeriodKey;
    requestedStart: string;
    requestedEnd: string;
    segments: TwrSegment[];
  };
};

export type AccountOverviewView =
  | {
      kind: "ready";
      account: Account;
      nav: NavStripData;
      holdings: HoldingRow[];
      transactions: Transaction[];
      allocation: {
        bar: AllocationSlice[];
        offsets: AllocationSlice[];
        equityRows: EquityAllocationRow[];
      };
      sourceFiles: { transactions: string[]; positions: string[] };
      dataThroughDate: string;
      warnings: Warning[];
      loadedAt: string;
    }
  | { kind: "no-data"; account: Account };

export interface LoadAccountOverviewViewOpts {
  db?: Database.Database;
  period: PeriodKey;
  today?: string;
  includeMarketData?: boolean;
}

export async function loadAccountOverviewView(
  uuid: string,
  opts: LoadAccountOverviewViewOpts,
): Promise<AccountOverviewView | null> {
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
  const latestSnapshotRows = latestSnapDate
    ? getSnapshotByDate(db, account.id, latestSnapDate)
    : [];

  if (transactions.length === 0 && earliestSnapshot === null) {
    return { kind: "no-data", account };
  }

  const bootstrap: Config = {
    seedDate: account.seedDate ?? "",
    seedValue: account.seedValue ?? 0,
    marketData: { enabled: true },
    benchmark: account.benchmark,
  };

  const seed = chooseSeed({ transactions, earliestSnapshot, config: bootstrap });

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

  const today = opts.today ?? yesterdayInET();
  const period = resolvePeriod(opts.period, today, seed.asOf);

  const includeMarket = opts.includeMarketData ?? true;

  if (includeMarket) {
    await enrichWithMarketData(state, seed, today);
  }

  const liveNav =
    latestSnapshotRows.length > 0
      ? computeLiveNavFromSnapshot(latestSnapshotRows)
      : null;
  const allSnapshotRows = getAllSnapshotsByAccount(db, account.id);
  const nav = await buildNavStrip(
    account,
    state,
    allSnapshotRows,
    period,
    liveNav,
    includeMarket,
  );

  const quoteMap: Record<string, Quote | null> = {};
  if (includeMarket) {
    const snapSymbols = new Set(latestSnapshotRows.map((r) => r.symbol));
    const missing = state.openSharePositions
      .map((s) => s.ticker)
      .filter((t) => !snapSymbols.has(t));
    if (missing.length > 0) {
      const results = await fetchQuotes(missing);
      for (const r of results) {
        if (r.kind === "ok") quoteMap[r.quote.ticker] = r.quote;
      }
      for (const t of missing) if (!(t in quoteMap)) quoteMap[t] = null;
    }
  }

  const holdings = buildHoldings(
    latestSnapshotRows,
    state,
    quoteMap,
    nav.current,
  );
  const allocation = buildAllocation(latestSnapshotRows, state, quoteMap);

  const txSourceFiles = Array.from(
    new Set(txRows.map((r) => r.source_file)),
  ).sort();
  const posSourceFiles = Array.from(
    new Set(latestSnapshotRows.map((r) => r.source_file)),
  ).sort();

  const dataThroughDate = latestSnapDate ?? today;

  return {
    kind: "ready",
    account,
    nav,
    holdings,
    transactions: state.transactions,
    allocation,
    sourceFiles: { transactions: txSourceFiles, positions: posSourceFiles },
    dataThroughDate,
    warnings: state.warnings,
    loadedAt: new Date().toISOString(),
  };
}

async function enrichWithMarketData(
  state: PortfolioState,
  seed: Seed,
  endDate: string,
): Promise<void> {
  if (endDate < seed.asOf) return;
  const tickers = new Set<string>();
  for (const s of seed.initialShares) tickers.add(s.ticker);
  for (const t of state.transactions) {
    if ((t.action === "Buy" || t.action === "Sell") && t.ticker) {
      tickers.add(t.ticker);
    }
  }
  if (tickers.size === 0) return;

  const historicalCloses: Record<string, Record<string, number>> = {};
  const fetchFailures: Array<{ ticker: string; reason: string }> = [];
  for (const ticker of Array.from(tickers).sort()) {
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

async function buildNavStrip(
  account: Account,
  state: PortfolioState,
  snapshotRows: PositionSnapshotRow[],
  period: { key: PeriodKey; start: string; end: string; clampedToSeed: boolean },
  liveNav: number | null,
  includeMarketData: boolean,
): Promise<NavStripData> {
  const navPoints = navSeriesFromSnapshots(snapshotRows);

  // Append the live snapshot's mark-to-market value as the last NAV point
  // so the strip reflects "today" rather than the most recent CSV export.
  const augmented =
    liveNav !== null && navPoints.length > 0
      ? [...navPoints, { date: period.end, nav: liveNav }]
      : navPoints;

  const seed =
    account.seedDate !== null && account.seedValue !== null
      ? { date: account.seedDate, value: account.seedValue }
      : null;

  const twrResult = computeTwr({
    navPoints: augmented,
    transactions: state.transactions,
    period: { from: period.start, to: period.end },
    seed,
  });

  for (const w of twrResult.warnings) state.warnings.push(w);

  let benchmark: BenchmarkResult | null = null;
  if (
    includeMarketData &&
    typeof account.benchmark === "string" &&
    account.benchmark.length > 0 &&
    twrResult.effectiveStart &&
    twrResult.effectiveEnd
  ) {
    const res = await loadHistoricalCloses(
      account.benchmark,
      twrResult.effectiveStart.date,
      twrResult.effectiveEnd.date,
    );
    if (res.kind === "ok") {
      benchmark = computeBenchmark({
        ticker: account.benchmark,
        closes: res.closes,
        fromDate: twrResult.effectiveStart.date,
        toDate: twrResult.effectiveEnd.date,
      });
    } else {
      state.warnings.push({
        kind: "MissingHistoricalPrices",
        ticker: account.benchmark,
        reason: res.message,
      });
    }
  }

  const current =
    liveNav ?? augmented.at(-1)?.nav ?? state.config.seedValue;

  return {
    current,
    twr: twrResult.twr,
    effectiveStart: twrResult.effectiveStart,
    effectiveEnd: twrResult.effectiveEnd,
    // Surface clamping from either the period (requested span fell before
    // seed) or the TWR engine (no seed and earliest snapshot post-dated
    // the requested start).
    clamped: period.clampedToSeed || twrResult.clamped,
    benchmark,
    computation: {
      period: period.key,
      requestedStart: period.start,
      requestedEnd: period.end,
      segments: twrResult.segments,
    },
  };
}

function isEquityLike(assetType: string | null): boolean {
  const lowered = (assetType ?? "").toLowerCase();
  return (
    lowered === "equity" ||
    lowered === "etf" ||
    lowered === "etfs" ||
    lowered === "stock"
  );
}

function isCashRow(row: PositionSnapshotRow): boolean {
  const lowered = (row.asset_type ?? "").toLowerCase();
  return lowered === "cash" || row.symbol.toLowerCase().startsWith("cash");
}

function isOptionLike(assetType: string | null): boolean {
  const lowered = (assetType ?? "").toLowerCase();
  return lowered === "option" || lowered === "options";
}

function computeLiveNavFromSnapshot(rows: PositionSnapshotRow[]): number {
  let total = 0;
  for (const r of rows) {
    if (isCashRow(r) || isEquityLike(r.asset_type) || isOptionLike(r.asset_type)) {
      total += r.market_value ?? 0;
    }
  }
  return total;
}

function buildHoldings(
  snapshotRows: PositionSnapshotRow[],
  state: PortfolioState,
  quoteMap: Record<string, Quote | null>,
  navTotal: number,
): HoldingRow[] {
  const rows: HoldingRow[] = [];
  const seenSymbols = new Set<string>();

  for (const r of snapshotRows) {
    if (!isEquityLike(r.asset_type)) continue;
    if (isCashRow(r)) continue;
    seenSymbols.add(r.symbol);
    const value = r.market_value ?? 0;
    rows.push({
      symbol: r.symbol,
      description: r.description,
      qty: r.quantity,
      avgCost:
        r.cost_basis !== null && r.quantity !== null && r.quantity !== 0
          ? r.cost_basis / r.quantity
          : null,
      price: r.price,
      value,
      pctOfAccount: navTotal === 0 ? 0 : value / navTotal,
      dayChangePct: null,
      source: "snapshot",
    });
  }

  for (const open of state.openSharePositions) {
    if (seenSymbols.has(open.ticker)) continue;
    const quote = quoteMap[open.ticker] ?? null;
    const price = quote?.price ?? null;
    const value = open.shares * (price ?? open.weightedCostBasis);
    const dayChangePct =
      quote && quote.prevClose !== null && quote.prevClose !== 0
        ? (quote.price - quote.prevClose) / quote.prevClose
        : null;
    rows.push({
      symbol: open.ticker,
      description: null,
      qty: open.shares,
      avgCost: open.weightedCostBasis,
      price,
      value,
      pctOfAccount: navTotal === 0 ? 0 : value / navTotal,
      dayChangePct,
      source: "live",
    });
  }

  rows.sort((a, b) => b.value - a.value);
  return rows;
}

function buildAllocation(
  snapshotRows: PositionSnapshotRow[],
  state: PortfolioState,
  quoteMap: Record<string, Quote | null>,
): {
  bar: AllocationSlice[];
  offsets: AllocationSlice[];
  equityRows: EquityAllocationRow[];
} {
  const bucketTotals: Record<string, number> = {
    EQUITY: 0,
    OPTION: 0,
    CASH: 0,
    OTHER: 0,
  };
  const equityBySymbol: Record<string, number> = {};

  for (const r of snapshotRows) {
    const value = r.market_value ?? 0;
    if (isCashRow(r)) {
      bucketTotals.CASH += value;
    } else if (isOptionLike(r.asset_type)) {
      bucketTotals.OPTION += value;
    } else if (isEquityLike(r.asset_type)) {
      bucketTotals.EQUITY += value;
      equityBySymbol[r.symbol] = (equityBySymbol[r.symbol] ?? 0) + value;
    } else {
      bucketTotals.OTHER += value;
    }
  }

  const snapEquitySymbols = new Set(
    snapshotRows
      .filter((r) => isEquityLike(r.asset_type) && !isCashRow(r))
      .map((r) => r.symbol),
  );
  for (const open of state.openSharePositions) {
    if (snapEquitySymbols.has(open.ticker)) continue;
    const price = quoteMap[open.ticker]?.price ?? open.weightedCostBasis;
    const value = open.shares * price;
    bucketTotals.EQUITY += value;
    equityBySymbol[open.ticker] = (equityBySymbol[open.ticker] ?? 0) + value;
  }

  const total =
    bucketTotals.EQUITY + bucketTotals.OPTION + bucketTotals.CASH + bucketTotals.OTHER;
  const denom = total > 0 ? total : 1;

  const slices: AllocationSlice[] = (
    ["EQUITY", "OPTION", "CASH", "OTHER"] as const
  ).map((bucket) => ({
    bucket,
    value: bucketTotals[bucket],
    pct: bucketTotals[bucket] / denom,
  }));
  const bar: AllocationSlice[] = slices.filter((s) => s.value > 0);
  const offsets: AllocationSlice[] = slices.filter((s) => s.value < 0);

  const equityTotal = bucketTotals.EQUITY;
  const equityRows: EquityAllocationRow[] = Object.entries(equityBySymbol)
    .map(([symbol, value]) => ({
      symbol,
      value,
      pctOfEquity: equityTotal === 0 ? 0 : value / equityTotal,
    }))
    .sort((a, b) => b.value - a.value);

  if (equityRows.length > 10) {
    const top = equityRows.slice(0, 10);
    const tail = equityRows.slice(10);
    const tailValue = tail.reduce((a, r) => a + r.value, 0);
    top.push({
      symbol: "Other",
      value: tailValue,
      pctOfEquity: equityTotal === 0 ? 0 : tailValue / equityTotal,
    });
    return { bar, offsets, equityRows: top };
  }
  return { bar, offsets, equityRows };
}
