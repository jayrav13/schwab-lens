import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";
import {
  type Account,
  getAccountByUuid,
} from "@/lib/db/repos/accounts";
import { listTransactionsByAccount } from "@/lib/db/repos/transactions";
import {
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
import type { Config, PortfolioState, Seed, Warning } from "@/lib/model/types";
import type { Transaction } from "@/lib/csv/types";
import { yesterdayInET } from "@/lib/util/dates";
import {
  resolvePeriod,
  type PeriodKey,
  type ResolvedPeriod,
} from "@/lib/server/period";

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
  start: number;
  changeAmount: number;
  changePct: number;
  computation: {
    period: PeriodKey;
    requestedStart: string;
    effectiveStart: string;
    end: string;
    clampedToSeed: boolean;
    seedDate: string;
    seedValue: number;
    formula: string;
  };
};

export type AccountOverviewView =
  | {
      kind: "ready";
      account: Account;
      nav: NavStripData;
      holdings: HoldingRow[];
      transactions: Transaction[];
      allocation: { bar: AllocationSlice[]; equityRows: EquityAllocationRow[] };
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
  const nav = buildNavStrip(state, liveNav, period);

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

function buildNavStrip(
  state: PortfolioState,
  liveNav: number | null,
  period: ResolvedPeriod,
): NavStripData {
  const series =
    state.portfolioValueSeries && state.portfolioValueSeries.length > 0
      ? state.portfolioValueSeries
      : state.navSeries;

  // Mark-to-market live NAV from the latest snapshot wins when present —
  // it reflects what the account is actually worth today (stocks + cash).
  // Options market value is intentionally excluded for now.
  const current =
    liveNav ?? series.at(-1)?.nav ?? state.config.seedValue;

  const startPoint = closestOnOrBefore(series, period.start);
  const start = startPoint?.nav ?? state.config.seedValue;

  const changeAmount = current - start;
  const changePct = start === 0 ? 0 : changeAmount / start;

  return {
    current,
    start,
    changeAmount,
    changePct,
    computation: {
      period: period.key,
      requestedStart: period.start,
      effectiveStart: startPoint?.date ?? period.start,
      end: period.end,
      clampedToSeed: period.clampedToSeed,
      seedDate: state.config.seedDate,
      seedValue: state.config.seedValue,
      formula: "(end − start) / start",
    },
  };
}

function closestOnOrBefore(
  series: Array<{ date: string; nav: number }>,
  target: string,
): { date: string; nav: number } | null {
  let last: { date: string; nav: number } | null = null;
  for (const p of series) {
    if (p.date <= target) last = p;
    else break;
  }
  return last;
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
    if (isCashRow(r) || isEquityLike(r.asset_type)) {
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
): { bar: AllocationSlice[]; equityRows: EquityAllocationRow[] } {
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

  const bar: AllocationSlice[] = (
    ["EQUITY", "OPTION", "CASH", "OTHER"] as const
  )
    .map((bucket) => ({
      bucket,
      value: bucketTotals[bucket],
      pct: bucketTotals[bucket] / denom,
    }))
    .filter((s) => s.value > 0);

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
    return { bar, equityRows: top };
  }
  return { bar, equityRows };
}
