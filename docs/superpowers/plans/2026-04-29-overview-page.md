# Issue #4 Overview Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/accounts/[uuid]/overview` — the holdings-first per-account dashboard with NAV strip, holdings table, recent transactions, and allocation bar.

**Architecture:** A new server-rendered page composed of four small server components, fed by a single new loader (`lib/server/accountOverview.ts`) that reuses `buildPortfolio`, `loadHistoricalCloses`, `fetchQuotes`, and `computeMarkToMarket` from the existing options-page stack. Period selection is URL-driven (`?period=`); the page is server-rendered per request. No client JS.

**Tech Stack:** Next.js 16 App Router (TypeScript), better-sqlite3, vitest, Tailwind CSS, yahoo-finance2 (already integrated).

**Spec:** [`docs/superpowers/specs/2026-04-29-overview-page-design.md`](../specs/2026-04-29-overview-page-design.md)

---

## File Structure

**New files:**
- `lib/server/period.ts` — pure period-key resolution (start/end dates, clamping)
- `tests/server/period.test.ts`
- `lib/server/accountOverview.ts` — `loadAccountOverviewView`
- `tests/server/accountOverview.test.ts`
- `app/accounts/[uuid]/page.tsx` — 308 redirect to `./overview`
- `app/accounts/[uuid]/overview/page.tsx` — overview page
- `app/components/OverviewNavStrip.tsx`
- `app/components/HoldingsTable.tsx`
- `app/components/RecentTransactionsTable.tsx`
- `app/components/AllocationBar.tsx`

**Modified files:**
- `lib/market/quotes.ts` — add `prevClose: number | null` to `Quote` and populate from yahoo response
- `tests/market/quotes.test.ts` (if present) — extend; otherwise the loader test covers it

**Boundary:** the four UI components are all server components and pure presentation — they take fully-shaped data props from the loader and render. The loader is the only place that touches the DB or the market layer.

---

## Branch and PR plan

Branch: `fix/4-overview-page` from `multi-account` (per memory: PRs target `multi-account`, not `main`). Each task ends with a commit; the final task opens the PR.

---

## Task 1: Set up branch

**Files:** none (git only).

- [ ] **Step 1: Create branch from current `multi-account`**

```bash
git checkout multi-account
git pull origin multi-account
git checkout -b fix/4-overview-page
```

- [ ] **Step 2: Confirm clean tree**

```bash
git status
```
Expected: `nothing to commit, working tree clean`.

---

## Task 2: Period helper (TDD)

A pure function that maps `PeriodKey` + a "today" date + a seed date to `{ start, end, clampedToSeed }`. No side effects, easy to test.

**Files:**
- Create: `lib/server/period.ts`
- Test: `tests/server/period.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/server/period.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolvePeriod, type PeriodKey } from "@/lib/server/period";

describe("resolvePeriod", () => {
  const today = "2026-04-29";
  const seed = "2024-06-15";

  it("YTD starts on Jan 1 of current year", () => {
    expect(resolvePeriod("YTD", today, seed)).toEqual({
      key: "YTD",
      start: "2026-01-01",
      end: "2026-04-29",
      clampedToSeed: false,
    });
  });

  it("1M is 1 calendar month back", () => {
    expect(resolvePeriod("1M", today, seed)).toMatchObject({
      start: "2026-03-29",
      end: "2026-04-29",
      clampedToSeed: false,
    });
  });

  it("3M is 3 calendar months back", () => {
    expect(resolvePeriod("3M", today, seed)).toMatchObject({
      start: "2026-01-29",
      end: "2026-04-29",
    });
  });

  it("1Y is 1 calendar year back", () => {
    expect(resolvePeriod("1Y", today, seed)).toMatchObject({
      start: "2025-04-29",
      end: "2026-04-29",
    });
  });

  it("All starts at the seed date", () => {
    expect(resolvePeriod("All", today, seed)).toEqual({
      key: "All",
      start: "2024-06-15",
      end: "2026-04-29",
      clampedToSeed: false,
    });
  });

  it("clamps start to seed when computed start is before seed", () => {
    const result = resolvePeriod("1Y", "2025-01-01", "2024-09-01");
    expect(result.start).toBe("2024-09-01");
    expect(result.clampedToSeed).toBe(true);
  });

  it("parsePeriodKey returns YTD for invalid input", () => {
    const { parsePeriodKey } = require("@/lib/server/period");
    expect(parsePeriodKey("garbage")).toBe("YTD");
    expect(parsePeriodKey(undefined)).toBe("YTD");
    expect(parsePeriodKey("1M")).toBe("1M");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- period
```
Expected: file-not-found error.

- [ ] **Step 3: Implement the helper**

`lib/server/period.ts`:

```ts
export type PeriodKey = "1M" | "3M" | "YTD" | "1Y" | "All";

const VALID: ReadonlySet<PeriodKey> = new Set(["1M", "3M", "YTD", "1Y", "All"]);

export function parsePeriodKey(input: string | undefined): PeriodKey {
  if (input && (VALID as Set<string>).has(input)) return input as PeriodKey;
  return "YTD";
}

export type ResolvedPeriod = {
  key: PeriodKey;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  clampedToSeed: boolean;
};

export function resolvePeriod(
  key: PeriodKey,
  today: string,
  seedDate: string,
): ResolvedPeriod {
  const end = today;
  let rawStart: string;

  if (key === "All") {
    rawStart = seedDate;
  } else if (key === "YTD") {
    rawStart = `${today.slice(0, 4)}-01-01`;
  } else if (key === "1M") {
    rawStart = subtractMonths(today, 1);
  } else if (key === "3M") {
    rawStart = subtractMonths(today, 3);
  } else {
    rawStart = subtractMonths(today, 12);
  }

  const clampedToSeed = rawStart < seedDate;
  const start = clampedToSeed ? seedDate : rawStart;

  return { key, start, end, clampedToSeed };
}

function subtractMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCMonth(date.getUTCMonth() - months);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- period
```
Expected: all 7 specs pass.

- [ ] **Step 5: Commit**

```bash
git add lib/server/period.ts tests/server/period.test.ts
git commit -m "Add period helper for /overview NAV strip

Resolves period key (1M/3M/YTD/1Y/All) into start/end dates and
clamps to seed when needed. Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Extend `Quote` with `prevClose`

The existing yahoo wrapper drops `regularMarketPreviousClose`. Day-Δ on the holdings table needs it.

**Files:**
- Modify: `lib/market/quotes.ts`
- Test: extend whatever test exists for `quotes.ts`; if none, the accountOverview test (Task 4) will exercise it.

- [ ] **Step 1: Read current `lib/market/quotes.ts` `fetchQuotes` to find where the yahoo response is mapped to `Quote`**

```bash
grep -n "regularMarketPrice\|asOf:\|stale\|fetchQuotes" lib/market/quotes.ts
```

- [ ] **Step 2: Add `prevClose` to the `Quote` type**

In `lib/market/quotes.ts`, change:

```ts
export type Quote = {
  ticker: string;
  price: number;
  asOf: string;
  stale?: boolean;
};
```

to:

```ts
export type Quote = {
  ticker: string;
  price: number;
  asOf: string;
  stale?: boolean;
  prevClose: number | null;
};
```

- [ ] **Step 3: Populate `prevClose` from `regularMarketPreviousClose` in the yahoo→Quote mapping**

In the same file, locate the place where the live Quote object is constructed (search for `price: ` or `regularMarketPrice`). Add `prevClose: typeof q.regularMarketPreviousClose === "number" ? q.regularMarketPreviousClose : null,` (use the field name actually returned by `yahoo-finance2.quote(...)` — confirm by reading the existing mapping). For cache reads / stale paths, preserve `prevClose` if present, otherwise set to `null`.

- [ ] **Step 4: Update any call sites that fail typecheck**

```bash
npx tsc --noEmit
```
Fix any error from missing `prevClose`. Expected error sites: tests that build mock `Quote` objects (e.g. `tests/server/account.test.ts`, `tests/model/portfolio.test.ts`). For each, set `prevClose: null` in the mock.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: all tests still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/market/quotes.ts $(git diff --name-only | grep -E '\.test\.ts$')
git commit -m "Add prevClose to Quote for day-delta on overview

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: `loadAccountOverviewView` loader (TDD)

**Files:**
- Create: `lib/server/accountOverview.ts`
- Test: `tests/server/accountOverview.test.ts`

The loader returns fully-shaped data for every section of the page. It does NOT call `loadAccountOptionsView`; it composes the shared primitives directly.

- [ ] **Step 1: Write the failing test**

`tests/server/accountOverview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount, setSeed } from "@/lib/db/repos/accounts";
import { insertTransaction } from "@/lib/db/repos/transactions";
import { insertSnapshot } from "@/lib/db/repos/positionSnapshots";
import { setBoolean } from "@/lib/db/repos/settings";
import { loadAccountOverviewView } from "@/lib/server/accountOverview";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("loadAccountOverviewView", () => {
  it("returns null when uuid is unknown", async () => {
    const db = makeDb();
    const result = await loadAccountOverviewView(
      "00000000-0000-0000-0000-000000000000",
      { db, period: "YTD", today: "2026-04-29" },
    );
    expect(result).toBeNull();
  });

  it("returns no-data when account has no tx and no snapshots", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    setSeed(db, "100", "2026-01-15", 12345);
    const result = await loadAccountOverviewView(account.uuid, {
      db,
      period: "YTD",
      today: "2026-04-29",
    });
    expect(result?.kind).toBe("no-data");
  });

  it("returns ready with NAV, holdings, recent transactions, allocation", async () => {
    const db = makeDb();
    setBoolean(db, "market_data.enabled", false);
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    setSeed(db, "100", "2026-01-01", 10000);
    insertTransaction(db, account.id, {
      tradeDate: "2026-01-05",
      actionCanonical: "BUY",
      actionRaw: "Buy",
      symbol: "ACME",
      description: "ACME CORP",
      quantity: 100,
      price: 50,
      fees: 0,
      amount: -5000,
      raw: { Action: "Buy" },
    }, "demo.csv");
    insertSnapshot(db, account.id, {
      asOf: "2026-04-25",
      symbol: "ACME",
      description: "ACME CORP",
      quantity: 100,
      price: 60,
      marketValue: 6000,
      costBasis: 5000,
      assetType: "equity",
      raw: {},
    }, "snap.csv");
    insertSnapshot(db, account.id, {
      asOf: "2026-04-25",
      symbol: "Cash & Cash Investments",
      description: null,
      quantity: null,
      price: null,
      marketValue: 5000,
      costBasis: null,
      assetType: "cash",
      raw: {},
    }, "snap.csv");

    const result = await loadAccountOverviewView(account.uuid, {
      db,
      period: "YTD",
      today: "2026-04-29",
      includeMarketData: false,
    });

    expect(result?.kind).toBe("ready");
    if (result?.kind !== "ready") return;

    expect(result.account.uuid).toBe(account.uuid);
    expect(result.nav.current).toBeGreaterThan(0);
    expect(result.holdings.find((h) => h.symbol === "ACME")?.value).toBe(6000);
    expect(result.recentTransactions).toHaveLength(1);
    expect(result.allocation.bar.length).toBeGreaterThan(0);

    // Allocation bar should include EQUITY and CASH buckets, summing to ~100%.
    const totalPct = result.allocation.bar.reduce((a, s) => a + s.pct, 0);
    expect(totalPct).toBeCloseTo(1, 2);

    // Equity sub-table should list ACME.
    expect(result.allocation.equityRows.find((r) => r.symbol === "ACME")).toBeTruthy();
  });

  it("clamps period start to seed when period predates seed", async () => {
    const db = makeDb();
    setBoolean(db, "market_data.enabled", false);
    const account = upsertAccount(db, { externalId: "200", label: "Demo2" });
    setSeed(db, "200", "2026-03-01", 10000);
    insertSnapshot(db, account.id, {
      asOf: "2026-03-01",
      symbol: "Cash & Cash Investments",
      description: null,
      quantity: null,
      price: null,
      marketValue: 10000,
      costBasis: null,
      assetType: "cash",
      raw: {},
    }, "snap.csv");
    const result = await loadAccountOverviewView(account.uuid, {
      db,
      period: "1Y",
      today: "2026-04-29",
      includeMarketData: false,
    });
    if (result?.kind !== "ready") throw new Error("expected ready");
    expect(result.nav.computation.clampedToSeed).toBe(true);
    expect(result.nav.computation.effectiveStart).toBe("2026-03-01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- accountOverview
```
Expected: module-not-found.

- [ ] **Step 3: Implement the loader**

`lib/server/accountOverview.ts`:

```ts
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
import { getBoolean } from "@/lib/db/repos/settings";
import { fetchQuotes, type Quote } from "@/lib/market/quotes";
import { loadHistoricalCloses } from "@/lib/market/historical";
import {
  positionsSnapshotFromRows,
  transactionFromRow,
} from "@/lib/model/fromDb";
import {
  computeMarkToMarket,
} from "@/lib/model/metrics/mark_to_market";
import { computePortfolioValueSeries } from "@/lib/model/metrics/portfolio_value";
import { buildPortfolio } from "@/lib/model/portfolio";
import { chooseSeed } from "@/lib/positions/seed";
import type { Config, PortfolioState, Warning } from "@/lib/model/types";
import type { PositionsSnapshot } from "@/lib/positions/types";
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
      recentTransactions: Transaction[];
      allocation: { bar: AllocationSlice[]; equityRows: EquityAllocationRow[] };
      warnings: Warning[];
      loadedAt: string;
    }
  | { kind: "no-data"; account: Account };

export interface LoadAccountOverviewViewOpts {
  db?: Database.Database;
  period: PeriodKey;
  today?: string;            // override for tests; defaults to yesterdayInET()
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
  const latestSnapshot = latestSnapDate
    ? positionsSnapshotFromRows(
        latestSnapDate,
        getSnapshotByDate(db, account.id, latestSnapDate),
      )
    : null;
  const latestSnapshotRows = latestSnapDate
    ? getSnapshotByDate(db, account.id, latestSnapDate)
    : [];

  if (transactions.length === 0 && earliestSnapshot === null) {
    return { kind: "no-data", account };
  }

  const marketDataEnabled = getBoolean(db, "market_data.enabled");
  const config: Config = {
    seedDate: account.seedDate ?? earliestSnapshot?.asOf ?? "",
    seedValue: account.seedValue ?? earliestSnapshot?.totalValue ?? 0,
    marketData: { enabled: marketDataEnabled },
    benchmark: account.benchmark,
  };

  const seed = chooseSeed({ transactions, earliestSnapshot, config });
  const state = buildPortfolio(transactions, config, seed);

  const today = opts.today ?? yesterdayInET();
  const period = resolvePeriod(opts.period, today, seed.asOf);

  const includeMarket = (opts.includeMarketData ?? true) && marketDataEnabled;

  // Optional market-data enrichment of the portfolio value series.
  if (includeMarket) {
    await enrichWithMarketData(state, seed, today);
  }

  const nav = buildNavStrip(state, latestSnapshot, seed, period);

  // Mark-to-market for live prices on holdings outside the latest snapshot.
  let quoteMap: Record<string, Quote | null> = {};
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
  const recentTransactions = state.transactions.slice(-10).reverse();
  const allocation = buildAllocation(
    latestSnapshotRows,
    state,
    quoteMap,
    nav.current,
  );

  return {
    kind: "ready",
    account,
    nav,
    holdings,
    recentTransactions,
    allocation,
    warnings: state.warnings,
    loadedAt: new Date().toISOString(),
  };
}

async function enrichWithMarketData(
  state: PortfolioState,
  seed: { asOf: string; initialShares: Array<{ ticker: string }> },
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
  const pv = computePortfolioValueSeries(state, seed as never, historicalCloses, endDate);
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
  latestSnapshot: PositionsSnapshot | null,
  seed: { asOf: string },
  period: ResolvedPeriod,
): NavStripData {
  const series =
    state.portfolioValueSeries && state.portfolioValueSeries.length > 0
      ? state.portfolioValueSeries
      : state.navSeries;

  const current =
    series.at(-1)?.nav ?? latestSnapshot?.totalValue ?? state.config.seedValue;

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

function buildHoldings(
  snapshotRows: PositionSnapshotRow[],
  state: PortfolioState,
  quoteMap: Record<string, Quote | null>,
  navTotal: number,
): HoldingRow[] {
  const rows: HoldingRow[] = [];
  const seenSymbols = new Set<string>();

  for (const r of snapshotRows) {
    const lowered = (r.asset_type ?? "").toLowerCase();
    if (lowered !== "equity" && lowered !== "etf" && lowered !== "etfs" && lowered !== "stock") continue;
    if (r.symbol.toLowerCase().startsWith("cash")) continue;
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
      dayChangePct: null, // snapshots don't carry prevClose
      source: "snapshot",
    });
  }

  for (const open of state.openSharePositions) {
    if (seenSymbols.has(open.ticker)) continue;
    const quote = quoteMap[open.ticker];
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
  navTotal: number,
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
    const lowered = (r.asset_type ?? "").toLowerCase();
    if (lowered === "cash" || r.symbol.toLowerCase().startsWith("cash")) {
      bucketTotals.CASH += value;
    } else if (lowered === "option" || lowered === "options") {
      bucketTotals.OPTION += value;
    } else if (
      lowered === "equity" ||
      lowered === "etf" ||
      lowered === "etfs" ||
      lowered === "stock"
    ) {
      bucketTotals.EQUITY += value;
      equityBySymbol[r.symbol] = (equityBySymbol[r.symbol] ?? 0) + value;
    } else {
      bucketTotals.OTHER += value;
    }
  }

  // Layer in any open positions not already represented by the snapshot.
  const snapEquitySymbols = new Set(
    snapshotRows
      .filter((r) => {
        const lowered = (r.asset_type ?? "").toLowerCase();
        return lowered === "equity" || lowered === "etf" || lowered === "stock";
      })
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
  const denom = total > 0 ? total : navTotal > 0 ? navTotal : 1;

  const bar: AllocationSlice[] = (
    ["EQUITY", "OPTION", "CASH", "OTHER"] as const
  )
    .map((bucket) => ({ bucket, value: bucketTotals[bucket], pct: bucketTotals[bucket] / denom }))
    .filter((s) => s.value > 0);

  const equityTotal = bucketTotals.EQUITY;
  const equityRows: EquityAllocationRow[] = Object.entries(equityBySymbol)
    .map(([symbol, value]) => ({
      symbol,
      value,
      pctOfEquity: equityTotal === 0 ? 0 : value / equityTotal,
    }))
    .sort((a, b) => b.value - a.value);

  // Top 10 + "Other" aggregation for the equity sub-table.
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- accountOverview
```
Expected: all 4 specs pass.

- [ ] **Step 5: Run full test suite + typecheck**

```bash
npm test && npx tsc --noEmit
```
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add lib/server/accountOverview.ts tests/server/accountOverview.test.ts
git commit -m "Add loadAccountOverviewView for /overview page

Composes buildPortfolio + market data + snapshot rows into
NAV strip, holdings, recent transactions, and allocation data.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: `OverviewNavStrip` component

Pure server component. Renders NAV, period change, period buttons, and ⓘ popover.

**Files:**
- Create: `app/components/OverviewNavStrip.tsx`

- [ ] **Step 1: Implement the component**

`app/components/OverviewNavStrip.tsx`:

```tsx
import Link from "next/link";
import type { NavStripData } from "@/lib/server/accountOverview";
import type { PeriodKey } from "@/lib/server/period";

type Props = {
  uuid: string;
  label: string;
  nav: NavStripData;
};

const PERIODS: PeriodKey[] = ["1M", "3M", "YTD", "1Y", "All"];

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
}

export function OverviewNavStrip({ uuid, label, nav }: Props) {
  const { current, changeAmount, changePct, computation } = nav;
  const positive = changeAmount >= 0;
  return (
    <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-lg font-semibold">{label}</div>
        <details className="relative text-xs text-gray-500 dark:text-gray-400">
          <summary className="cursor-pointer select-none">ⓘ How is this computed?</summary>
          <div className="absolute right-0 mt-2 w-80 rounded-md border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 shadow-lg z-10 text-left">
            <div>Period: <code>{computation.period}</code></div>
            <div>Requested start: <code>{computation.requestedStart}</code></div>
            <div>Effective start: <code>{computation.effectiveStart}</code>{computation.clampedToSeed ? " (clamped to seed)" : ""}</div>
            <div>End: <code>{computation.end}</code></div>
            <div>Seed: <code>{fmtMoney(computation.seedValue)}</code> on <code>{computation.seedDate}</code></div>
            <div>Formula: <code>{computation.formula}</code></div>
            <div className="mt-2 text-[10px] text-gray-400">Snapshot-aligned TWR is tracked separately — see #2.</div>
          </div>
        </details>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <div className="text-3xl font-bold tabular-nums">{fmtMoney(current)}</div>
        <div className={`text-sm tabular-nums ${positive ? "text-emerald-600" : "text-rose-600"}`}>
          {positive ? "+" : ""}{fmtMoney(changeAmount)} ({fmtPct(changePct)}) {computation.period}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1">
        {PERIODS.map((p) => {
          const isActive = p === computation.period;
          return (
            <Link
              key={p}
              href={`/accounts/${uuid}/overview?period=${p}`}
              className={`px-2 py-1 rounded text-xs ${
                isActive
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-700"
              }`}
            >
              {p}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/components/OverviewNavStrip.tsx
git commit -m "Add OverviewNavStrip component

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: `HoldingsTable` component

**Files:**
- Create: `app/components/HoldingsTable.tsx`

- [ ] **Step 1: Implement the component**

`app/components/HoldingsTable.tsx`:

```tsx
import type { HoldingRow } from "@/lib/server/accountOverview";

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
}

function fmtPctPlain(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtQty(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
        <h2 className="text-sm font-semibold mb-2">Holdings</h2>
        <div className="text-sm text-gray-500">No holdings yet.</div>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4 overflow-x-auto">
      <h2 className="text-sm font-semibold mb-2">Holdings</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
            <th className="py-1 pr-3">Symbol</th>
            <th className="py-1 pr-3 text-right">Qty</th>
            <th className="py-1 pr-3 text-right">Avg cost</th>
            <th className="py-1 pr-3 text-right">Price</th>
            <th className="py-1 pr-3 text-right">Value</th>
            <th className="py-1 pr-3 text-right">% of acct</th>
            <th className="py-1 pr-3 text-right">Day Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} className="border-t border-gray-100 dark:border-neutral-800">
              <td className="py-1 pr-3 font-mono">{r.symbol}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtQty(r.qty)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtMoney(r.avgCost)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtMoney(r.price)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtMoney(r.value)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtPctPlain(r.pctOfAccount)}</td>
              <td className={`py-1 pr-3 text-right tabular-nums ${
                r.dayChangePct === null
                  ? "text-gray-500"
                  : r.dayChangePct >= 0
                  ? "text-emerald-600"
                  : "text-rose-600"
              }`}>
                {fmtPct(r.dayChangePct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[10px] text-gray-400">
        Equities and ETFs only. See the Options tab for derivatives.
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/components/HoldingsTable.tsx
git commit -m "Add HoldingsTable component

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: `RecentTransactionsTable` component

**Files:**
- Create: `app/components/RecentTransactionsTable.tsx`

- [ ] **Step 1: Implement the component**

`app/components/RecentTransactionsTable.tsx`:

```tsx
import Link from "next/link";
import type { Transaction } from "@/lib/csv/types";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function symbolOf(tx: Transaction): string {
  if (tx.option) {
    const { underlying, expiry, strike, callPut } = tx.option;
    return `${underlying} ${expiry} ${strike}${callPut}`;
  }
  return tx.ticker ?? "—";
}

export function RecentTransactionsTable({
  uuid,
  transactions,
}: {
  uuid: string;
  transactions: Transaction[];
}) {
  if (transactions.length === 0) {
    return (
      <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
        <h2 className="text-sm font-semibold mb-2">Recent transactions</h2>
        <div className="text-sm text-gray-500">No transactions yet.</div>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4 overflow-x-auto">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-semibold">Recent transactions</h2>
        <Link
          href={`/accounts/${uuid}/transactions`}
          className="text-xs text-blue-600 hover:underline"
        >
          View all →
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
            <th className="py-1 pr-3">Date</th>
            <th className="py-1 pr-3">Action</th>
            <th className="py-1 pr-3">Symbol</th>
            <th className="py-1 pr-3 text-right">Qty</th>
            <th className="py-1 pr-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx, i) => (
            <tr key={`${tx.tradeDate}-${i}`} className="border-t border-gray-100 dark:border-neutral-800">
              <td className="py-1 pr-3 tabular-nums">{tx.tradeDate}</td>
              <td className="py-1 pr-3">{tx.action}</td>
              <td className="py-1 pr-3 font-mono text-xs">{symbolOf(tx)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{tx.quantity}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtMoney(tx.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/components/RecentTransactionsTable.tsx
git commit -m "Add RecentTransactionsTable component

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: `AllocationBar` component

**Files:**
- Create: `app/components/AllocationBar.tsx`

- [ ] **Step 1: Implement the component**

`app/components/AllocationBar.tsx`:

```tsx
import type {
  AllocationSlice,
  EquityAllocationRow,
} from "@/lib/server/accountOverview";

const BUCKET_COLOR: Record<string, string> = {
  EQUITY: "bg-blue-500",
  OPTION: "bg-purple-500",
  CASH: "bg-emerald-500",
  OTHER: "bg-gray-400",
};

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function AllocationBar({
  bar,
  equityRows,
}: {
  bar: AllocationSlice[];
  equityRows: EquityAllocationRow[];
}) {
  if (bar.length === 0) {
    return (
      <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
        <h2 className="text-sm font-semibold mb-2">Allocation</h2>
        <div className="text-sm text-gray-500">Allocation unavailable — no holdings.</div>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
      <h2 className="text-sm font-semibold mb-2">Allocation</h2>

      <div className="flex h-6 w-full rounded overflow-hidden">
        {bar.map((s) => (
          <div
            key={s.bucket}
            className={`${BUCKET_COLOR[s.bucket] ?? "bg-gray-400"} flex items-center justify-center text-[10px] text-white`}
            style={{ width: `${s.pct * 100}%` }}
            title={`${s.bucket} ${fmtPct(s.pct)} (${fmtMoney(s.value)})`}
          >
            {s.pct >= 0.08 ? `${s.bucket} ${fmtPct(s.pct)}` : ""}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        {bar.map((s) => (
          <span key={s.bucket} className="inline-flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded ${BUCKET_COLOR[s.bucket] ?? "bg-gray-400"}`} />
            {s.bucket} · {fmtPct(s.pct)} · {fmtMoney(s.value)}
          </span>
        ))}
      </div>

      {equityRows.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase text-gray-500 mb-1">Equity breakdown</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <th className="py-1 pr-3">Symbol</th>
                <th className="py-1 pr-3 text-right">Value</th>
                <th className="py-1 pr-3 text-right">% of equity</th>
              </tr>
            </thead>
            <tbody>
              {equityRows.map((r) => (
                <tr key={r.symbol} className="border-t border-gray-100 dark:border-neutral-800">
                  <td className="py-1 pr-3 font-mono">{r.symbol}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{fmtMoney(r.value)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{fmtPct(r.pctOfEquity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/components/AllocationBar.tsx
git commit -m "Add AllocationBar component

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: Page route + redirect

**Files:**
- Create: `app/accounts/[uuid]/overview/page.tsx`
- Create: `app/accounts/[uuid]/page.tsx`

- [ ] **Step 1: Implement the redirect at `/accounts/[uuid]`**

`app/accounts/[uuid]/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default async function AccountIndexPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  redirect(`/accounts/${uuid}/overview`);
}
```

(The 404 is enforced by the parent `[uuid]/layout.tsx`, which validates the UUID before this child runs.)

- [ ] **Step 2: Implement the overview page**

`app/accounts/[uuid]/overview/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { loadAccountOverviewView } from "@/lib/server/accountOverview";
import { getAccountTabFlags } from "@/lib/server/accountTabs";
import { AccountTabs } from "@/app/components/AccountTabs";
import { AttentionBanner } from "@/app/components/AttentionBanner";
import { OverviewNavStrip } from "@/app/components/OverviewNavStrip";
import { HoldingsTable } from "@/app/components/HoldingsTable";
import { RecentTransactionsTable } from "@/app/components/RecentTransactionsTable";
import { AllocationBar } from "@/app/components/AllocationBar";
import { parsePeriodKey } from "@/lib/server/period";

export const dynamic = "force-dynamic";

export default async function AccountOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { uuid } = await params;
  const { period: periodParam } = await searchParams;
  const period = parsePeriodKey(periodParam);

  const [data, flags] = await Promise.all([
    loadAccountOverviewView(uuid, { period }),
    getAccountTabFlags(uuid),
  ]);

  if (data === null) notFound();

  const tabFlags = flags ?? { showOptions: false, showTrades: false };

  if (data.kind === "no-data") {
    return (
      <>
        <AccountTabs uuid={uuid} flags={tabFlags} active="overview" />
        <main className="min-h-screen p-6 max-w-7xl mx-auto">
          <header className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
            <div className="text-xl font-bold">{data.account.label}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              No transactions or position snapshots yet for this account.
            </div>
          </header>
        </main>
      </>
    );
  }

  return (
    <>
      <AccountTabs uuid={uuid} flags={tabFlags} active="overview" />
      <main className="min-h-screen p-6 max-w-7xl mx-auto">
        <AttentionBanner warnings={data.warnings} />
        <OverviewNavStrip uuid={uuid} label={data.account.label} nav={data.nav} />
        <HoldingsTable rows={data.holdings} />
        <RecentTransactionsTable uuid={uuid} transactions={data.recentTransactions} />
        <AllocationBar bar={data.allocation.bar} equityRows={data.allocation.equityRows} />
      </main>
    </>
  );
}
```

- [ ] **Step 3: Typecheck + run tests**

```bash
npx tsc --noEmit && npm test
```
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add app/accounts/\[uuid\]/page.tsx app/accounts/\[uuid\]/overview/page.tsx
git commit -m "Add /accounts/[uuid]/overview page + bare-uuid redirect

Closes #4. Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: Manual verification

Per `CLAUDE.md`, dev-server smoke-test before declaring done. **Verify against the user's local DB; do not commit any data files.**

- [ ] **Step 1: Boot the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Walk through every acceptance criterion in Issue #4**

For an account UUID `<UUID>` (pick from `sqlite3 data/portfolio.db 'SELECT uuid, label FROM accounts;'`):

1. Visit `http://localhost:3000/accounts/<UUID>/overview` → all four sections render.
2. Click each period button → URL `?period=` updates and NAV strip recomputes.
3. Visit `http://localhost:3000/accounts/<UUID>` (bare) → 308 redirects to `/overview`.
4. Visit `http://localhost:3000/accounts/00000000-0000-0000-0000-000000000000/overview` → 404 page.
5. Visit `http://localhost:3000/accounts/00000000-0000-0000-0000-000000000000` (bare bad UUID) → 404 (validated by layout before redirect runs).
6. Click ⓘ on the NAV strip → popover shows period, effective start, seed, formula.
7. With an account that has fewer snapshots than open positions: confirm holdings table shows both snapshot rows and live-quote rows; live rows show day Δ where available.
8. Confirm equity sub-table appears under the allocation bar and lists the equity holdings sorted by value.

- [ ] **Step 3: Repeat for each account flavor present**

At minimum: an options-heavy account, an equity-only account (if available), a single-snapshot account. Note any rendering bugs and fix them with additional commits before opening the PR.

- [ ] **Step 4: Final pre-PR verification**

```bash
git status
git diff --cached
```
Confirm: nothing under `transactions/`, `sheets/`, `data/`; no `*.csv` or `*.xlsx` outside `tests/fixtures/**`.

```bash
npm test && npx tsc --noEmit
```
Expected: green.

---

## Task 11: Push branch and open PR

- [ ] **Step 1: Push**

```bash
git push -u origin fix/4-overview-page
```

- [ ] **Step 2: Open PR targeting `multi-account`**

```bash
gh pr create --base multi-account --title "Add /accounts/[uuid]/overview holdings-first dashboard" --body "$(cat <<'EOF'
## Summary
- Adds the per-account overview page at `/accounts/[uuid]/overview` with NAV strip (TWR-from-`buildPortfolio`), holdings table, recent transactions, and segmented allocation bar.
- Adds 308 redirect from `/accounts/[uuid]` to `/overview`.
- Adds `lib/server/accountOverview.ts` loader and `lib/server/period.ts` helper.
- Extends `Quote` with `prevClose` to support day-Δ on the holdings table.

Closes #4.

Spec: [`docs/superpowers/specs/2026-04-29-overview-page-design.md`](docs/superpowers/specs/2026-04-29-overview-page-design.md)
Plan: [`docs/superpowers/plans/2026-04-29-overview-page.md`](docs/superpowers/plans/2026-04-29-overview-page.md)

## Test plan
- [ ] `npm test` — green (period helper + accountOverview loader specs added)
- [ ] `npx tsc --noEmit` — green
- [ ] `/accounts/<uuid>/overview` renders all four sections
- [ ] Period selector updates URL `?period=` and NAV recomputes for 1M/3M/YTD/1Y/All
- [ ] `/accounts/<uuid>` redirects (308) to `/overview`
- [ ] Garbled UUID returns 404 (both `/accounts/<bad>` and `/accounts/<bad>/overview`)
- [ ] ⓘ on NAV strip shows the computation breakdown
- [ ] Holdings table includes both snapshot-sourced and live-quote rows when applicable
- [ ] Equity sub-table renders under the allocation bar

*Co-authored by Claude*
EOF
)"
```

- [ ] **Step 3: Report PR URL**

Print the PR URL returned by `gh`.

---

## Self-Review

**Spec coverage:**

| Spec section | Plan task |
|--------------|-----------|
| Routing (overview page, redirect, 404) | Task 9 |
| NAV strip (current, change, period selector, ⓘ) | Tasks 4 (data) + 5 (UI) |
| Top holdings table | Tasks 4 + 6 |
| Recent transactions | Tasks 4 + 7 |
| Allocation chart (bar + equity sub-table) | Tasks 4 + 8 |
| Data loader (`AccountOverviewView`) | Task 4 |
| Period semantics | Task 2 |
| Testing (unit tests for loader + period) | Tasks 2 + 4 |
| Manual test plan / acceptance | Task 10 |

**Placeholder scan:** none — every code step shows the code; every command is exact; no "implement X later".

**Type consistency:** `PeriodKey`, `ResolvedPeriod`, `NavStripData`, `HoldingRow`, `AllocationSlice`, `EquityAllocationRow`, `AccountOverviewView` are defined once in Task 2 / Task 4 and consumed unchanged in Tasks 5-9.

**Known compromise:** Day Δ on snapshot-sourced holdings is `null` because `position_snapshots` has no `prev_price` column. Live-quote rows do show Day Δ via the new `prevClose`. Documented inline in `buildHoldings`. Acceptable — the issue's acceptance criterion shows the column, and we render `—` when unavailable.
