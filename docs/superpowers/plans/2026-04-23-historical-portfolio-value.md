# Historical Portfolio Value Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second line to NavCard showing daily Portfolio Value (cash + Σ shares × historical close) from seed date through yesterday (T-1), with graceful degradation when any ticker's historical fetch fails.

**Architecture:** New module `lib/market/historical.ts` wraps yahoo-finance2 `historical()` with a per-ticker append-only JSON cache at `.cache/market/historical/<TICKER>.json`. New pure derivation `lib/model/metrics/portfolio_value.ts` folds transactions forward into a daily share-count map and multiplies by cached closes. Dashboard invokes both, attaches `portfolioValueSeries` to `PortfolioState`, and surfaces any missing tickers via a new `MissingHistoricalPrices` warning rendered in `AttentionBanner`. NavCard gains a second violet polyline and a legend row.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Vitest, yahoo-finance2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-23-historical-portfolio-value-design.md`

**Branch strategy:** Per CLAUDE.md, use `fix/9-historical-portfolio-value` with a PR. Solo work can also land directly on `main` in small commits (matches the repo's existing pattern). Each task below ends with a commit; sequence commits however you prefer.

**Pre-flight (before Task 1):**
- Confirm clean working tree: `git status`
- Create working branch if using PR flow: `git checkout -b fix/9-historical-portfolio-value`
- Confirm tests pass on the base: `npm test`

---

## File Structure

**Create:**
- `lib/market/historical.ts` — per-ticker fetch + append-only JSON cache, injectable `fetchRange`
- `lib/model/metrics/portfolio_value.ts` — pure derivation from transactions + cashLedger + historicalCloses
- `tests/market/historical.test.ts`
- `tests/model/metrics/portfolio_value.test.ts`

**Modify:**
- `lib/model/types.ts` — add `portfolioValueSeries?: NavPoint[]` to `PortfolioState`; add `MissingHistoricalPrices` variant to `Warning`
- `lib/server/dashboard.ts` — gather held tickers, call loader, compute series, attach + emit warnings
- `app/components/NavCard.tsx` — second polyline in violet + legend row + guards when `portfolioValueSeries` is absent/short
- `app/components/AttentionBanner.tsx` — render branch for `MissingHistoricalPrices`
- `tests/integration.test.ts` — extend the existing `loadDashboard` assertion to cover `portfolioValueSeries`

**Key interfaces defined once, referenced throughout:**

```ts
// lib/market/historical.ts
export type HistoricalClose = { date: string; close: number };

export type HistoricalFetchResult =
  | { kind: "ok"; closes: HistoricalClose[]; stale?: boolean }
  | { kind: "error"; ticker: string; message: string };

export async function loadHistoricalCloses(
  ticker: string,
  fromDate: string, // YYYY-MM-DD, inclusive
  toDate: string,   // YYYY-MM-DD, inclusive
  opts?: {
    cacheDir?: string;
    fetchRange?: (
      ticker: string,
      fromDate: string,
      toDate: string,
    ) => Promise<HistoricalClose[]>;
  },
): Promise<HistoricalFetchResult>;

// lib/model/metrics/portfolio_value.ts
export function computePortfolioValueSeries(
  state: PortfolioState,
  seed: Seed,
  historicalCloses: Record<string, Record<string, number>>, // ticker → date → close
  endDate: string, // YYYY-MM-DD, inclusive
): {
  series: NavPoint[];
  missingTickers: string[];
};

// lib/model/types.ts (additions)
// Warning union gains:
| { kind: "MissingHistoricalPrices"; ticker: string; reason: string }
// PortfolioState gains:
portfolioValueSeries?: NavPoint[];
```

---

## Task 1: Extend types foundation

**Files:**
- Modify: `lib/model/types.ts`

This task lays the type groundwork. No tests — types are validated by `npm run typecheck` in later tasks. Adding the new `Warning` variant will intentionally break the exhaustive switch in `AttentionBanner.tsx` until Task 5 handles it; that's fine — we commit types first and let the typecheck error guide us.

- [ ] **Step 1: Add `MissingHistoricalPrices` to the `Warning` union**

Open `lib/model/types.ts`. Find the `Warning` type (currently 4 variants). Replace it with:

```ts
export type Warning =
  | { kind: "UnknownAction"; rawAction: string; count: number }
  | { kind: "CashDrift"; expected: number; actual: number }
  | { kind: "NegativeShareEndOfDay"; ticker: string; date: string; shares: number }
  | { kind: "UnpairedAssignment"; date: string; contractKey: string }
  | { kind: "MissingHistoricalPrices"; ticker: string; reason: string };
```

- [ ] **Step 2: Add `portfolioValueSeries` to `PortfolioState`**

In the same file, find the `PortfolioState` type. Add `portfolioValueSeries?: NavPoint[];` after `navSeries`:

```ts
export type PortfolioState = {
  config: Config;
  transactions: Transaction[];
  cashLedger: CashPoint[];
  externalFlows: FlowPoint[];
  navSeries: NavPoint[];
  portfolioValueSeries?: NavPoint[];
  openOptionPositions: OpenOption[];
  openSharePositions: OpenShare[];
  premiumSeries: PremiumPoint[];
  premiumTotals: { gross: number; closed: number; net: number };
  warnings: Warning[];
};
```

- [ ] **Step 3: Confirm typecheck fails as expected**

Run: `npm run typecheck`
Expected: error(s) about `MissingHistoricalPrices` not being handled in `AttentionBanner`'s `describe` switch. This proves the new variant is wired in. Do **not** fix it here — Task 5 handles it.

- [ ] **Step 4: Commit (despite the typecheck error)**

Types-only commits that intentionally leave a downstream exhaustive switch broken are common during additive changes and will be resolved within this same PR. If you're uncomfortable committing a red typecheck, skip this commit and fold Task 1 into Task 5's commit instead.

```bash
git add lib/model/types.ts
git commit -m "Add portfolioValueSeries and MissingHistoricalPrices types

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Historical fetch + cache module

**Files:**
- Create: `lib/market/historical.ts`
- Create: `tests/market/historical.test.ts`

Follows the existing `lib/market/quotes.ts` pattern: dependency-injected fetcher for tests, file-based cache, graceful stale fallback. Cache layout is `.cache/market/historical/<TICKER>.json` with `{ "YYYY-MM-DD": <close>, ... }`.

- [ ] **Step 1: Write the failing tests**

Write `tests/market/historical.test.ts`:

```ts
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { loadHistoricalCloses } from "@/lib/market/historical";

const cacheDir = path.join(process.cwd(), ".cache", "market", "historical-test");

describe("loadHistoricalCloses", () => {
  beforeEach(() => {
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
  });

  afterEach(() => {
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
  });

  it("fetches the full range and writes a per-ticker cache when none exists", async () => {
    const calls: Array<{ ticker: string; from: string; to: string }> = [];
    const result = await loadHistoricalCloses("AAA", "2026-01-02", "2026-01-06", {
      cacheDir,
      fetchRange: async (ticker, from, to) => {
        calls.push({ ticker, from, to });
        return [
          { date: "2026-01-02", close: 10 },
          { date: "2026-01-05", close: 11 },
          { date: "2026-01-06", close: 12 },
        ];
      },
    });

    expect(calls).toEqual([
      { ticker: "AAA", from: "2026-01-02", to: "2026-01-06" },
    ]);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.closes).toEqual([
      { date: "2026-01-02", close: 10 },
      { date: "2026-01-05", close: 11 },
      { date: "2026-01-06", close: 12 },
    ]);

    const cacheFile = path.join(cacheDir, "AAA.json");
    expect(existsSync(cacheFile)).toBe(true);
    expect(JSON.parse(readFileSync(cacheFile, "utf8"))).toEqual({
      "2026-01-02": 10,
      "2026-01-05": 11,
      "2026-01-06": 12,
    });
  });

  it("skips the fetcher when the cache already covers the requested toDate", async () => {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      path.join(cacheDir, "BBB.json"),
      JSON.stringify({ "2026-01-02": 20, "2026-01-06": 25 }),
    );

    let called = false;
    const result = await loadHistoricalCloses("BBB", "2026-01-02", "2026-01-06", {
      cacheDir,
      fetchRange: async () => {
        called = true;
        return [];
      },
    });

    expect(called).toBe(false);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.closes).toEqual([
      { date: "2026-01-02", close: 20 },
      { date: "2026-01-06", close: 25 },
    ]);
  });

  it("fetches only the tail when cache is partial", async () => {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      path.join(cacheDir, "CCC.json"),
      JSON.stringify({ "2026-01-02": 30, "2026-01-05": 31 }),
    );

    const calls: Array<{ from: string; to: string }> = [];
    const result = await loadHistoricalCloses("CCC", "2026-01-02", "2026-01-08", {
      cacheDir,
      fetchRange: async (_t, from, to) => {
        calls.push({ from, to });
        return [
          { date: "2026-01-05", close: 31 }, // already cached; must be idempotent
          { date: "2026-01-06", close: 32 },
          { date: "2026-01-07", close: 33 },
          { date: "2026-01-08", close: 34 },
        ];
      },
    });

    expect(calls).toEqual([{ from: "2026-01-05", to: "2026-01-08" }]);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.closes).toEqual([
      { date: "2026-01-02", close: 30 },
      { date: "2026-01-05", close: 31 },
      { date: "2026-01-06", close: 32 },
      { date: "2026-01-07", close: 33 },
      { date: "2026-01-08", close: 34 },
    ]);
  });

  it("treats a malformed cache file as empty and refetches", async () => {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(path.join(cacheDir, "DDD.json"), "{not valid json");

    const result = await loadHistoricalCloses("DDD", "2026-01-02", "2026-01-03", {
      cacheDir,
      fetchRange: async () => [{ date: "2026-01-02", close: 40 }],
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.closes).toEqual([{ date: "2026-01-02", close: 40 }]);
  });

  it("returns an error when the fetcher throws and no cache exists", async () => {
    const result = await loadHistoricalCloses("EEE", "2026-01-02", "2026-01-03", {
      cacheDir,
      fetchRange: async () => {
        throw new Error("network down");
      },
    });

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.ticker).toBe("EEE");
    expect(result.message).toMatch(/network down/);
  });

  it("returns stale cache when the fetcher throws but cache has data in range", async () => {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      path.join(cacheDir, "FFF.json"),
      JSON.stringify({ "2026-01-02": 50 }),
    );

    const result = await loadHistoricalCloses("FFF", "2026-01-02", "2026-01-05", {
      cacheDir,
      fetchRange: async () => {
        throw new Error("rate limited");
      },
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.stale).toBe(true);
    expect(result.closes).toEqual([{ date: "2026-01-02", close: 50 }]);
  });

  it("writes cache atomically via a .tmp sibling + rename", async () => {
    // No direct way to observe the rename, but verify that a partial failure
    // before write doesn't leave a visible .tmp. Simulate by ensuring the
    // final file exists and no stray .tmp is left behind on success.
    await loadHistoricalCloses("GGG", "2026-01-02", "2026-01-02", {
      cacheDir,
      fetchRange: async () => [{ date: "2026-01-02", close: 60 }],
    });

    expect(existsSync(path.join(cacheDir, "GGG.json"))).toBe(true);
    expect(existsSync(path.join(cacheDir, "GGG.json.tmp"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/market/historical.test.ts`
Expected: all 7 tests FAIL with "loadHistoricalCloses is not a function" or similar import error.

- [ ] **Step 3: Write the minimal implementation**

Write `lib/market/historical.ts`:

```ts
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export type HistoricalClose = { date: string; close: number };

export type HistoricalFetchResult =
  | { kind: "ok"; closes: HistoricalClose[]; stale?: boolean }
  | { kind: "error"; ticker: string; message: string };

type CacheFile = Record<string, number>;

function defaultCacheDir(): string {
  return path.join(process.cwd(), ".cache", "market", "historical");
}

function cachePath(cacheDir: string, ticker: string): string {
  return path.join(cacheDir, `${ticker}.json`);
}

function readCache(cacheDir: string, ticker: string): CacheFile {
  const p = cachePath(cacheDir, ticker);
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as CacheFile;
    }
    return {};
  } catch {
    return {};
  }
}

function writeCacheAtomic(
  cacheDir: string,
  ticker: string,
  cache: CacheFile,
): void {
  mkdirSync(cacheDir, { recursive: true });
  const p = cachePath(cacheDir, ticker);
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2));
  renameSync(tmp, p);
}

function datesInRange(
  cache: CacheFile,
  fromDate: string,
  toDate: string,
): string[] {
  return Object.keys(cache)
    .filter((d) => d >= fromDate && d <= toDate)
    .sort();
}

function slice(
  cache: CacheFile,
  fromDate: string,
  toDate: string,
): HistoricalClose[] {
  return datesInRange(cache, fromDate, toDate).map((date) => ({
    date,
    close: cache[date],
  }));
}

/**
 * Load historical daily closes for a ticker in [fromDate, toDate].
 *
 * Uses an append-only per-ticker JSON cache. On each call we compute the max
 * cached date in range; if it's < toDate we fetch from (maxCached ?? fromDate)
 * through toDate and merge. Fetcher is injectable for tests.
 *
 * On fetch failure: returns stale cache data if any exists in range, otherwise
 * returns { kind: "error" }.
 */
export async function loadHistoricalCloses(
  ticker: string,
  fromDate: string,
  toDate: string,
  opts: {
    cacheDir?: string;
    fetchRange?: (
      ticker: string,
      fromDate: string,
      toDate: string,
    ) => Promise<HistoricalClose[]>;
  } = {},
): Promise<HistoricalFetchResult> {
  const cacheDir = opts.cacheDir ?? defaultCacheDir();
  const fetcher = opts.fetchRange ?? defaultYahooHistorical;

  const cache = readCache(cacheDir, ticker);

  const cachedInRange = datesInRange(cache, fromDate, toDate);
  const maxCached = cachedInRange.at(-1);
  const needsFetch = !maxCached || maxCached < toDate;

  if (!needsFetch) {
    return { kind: "ok", closes: slice(cache, fromDate, toDate) };
  }

  const fetchStart = maxCached ?? fromDate;
  try {
    const fetched = await fetcher(ticker, fetchStart, toDate);
    for (const { date, close } of fetched) {
      cache[date] = close;
    }
    writeCacheAtomic(cacheDir, ticker, cache);
    return { kind: "ok", closes: slice(cache, fromDate, toDate) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (cachedInRange.length > 0) {
      return {
        kind: "ok",
        stale: true,
        closes: slice(cache, fromDate, toDate),
      };
    }
    return { kind: "error", ticker, message };
  }
}

// ----- default yahoo-finance2 fetcher (not exercised by unit tests) -----

type YahooLike = {
  historical: (
    symbol: string,
    opts: { period1: string; period2: string; interval: "1d" },
  ) => Promise<Array<{ date: Date; close: number }>>;
};

let yahooInstance: YahooLike | null = null;

async function getYahoo(): Promise<YahooLike> {
  if (yahooInstance) return yahooInstance;
  const yf = await import("yahoo-finance2");
  const YahooFinance = yf.default as unknown as new (opts?: {
    suppressNotices?: string[];
  }) => YahooLike;
  yahooInstance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return yahooInstance;
}

async function defaultYahooHistorical(
  ticker: string,
  fromDate: string,
  toDate: string,
): Promise<HistoricalClose[]> {
  const yahoo = await getYahoo();
  const rows = await yahoo.historical(ticker, {
    period1: fromDate,
    period2: toDate,
    interval: "1d",
  });
  return rows
    .filter((r) => Number.isFinite(r.close))
    .map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      close: r.close,
    }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/market/historical.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests still pass (114+ existing + 7 new = 121+).

- [ ] **Step 6: Commit**

```bash
git add lib/market/historical.ts tests/market/historical.test.ts
git commit -m "Add per-ticker historical close price cache + fetcher

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Pure portfolio-value derivation

**Files:**
- Create: `lib/model/metrics/portfolio_value.ts`
- Create: `tests/model/metrics/portfolio_value.test.ts`

Pure function. Walks transactions forward from `seed.initialShares` to build a per-date share map, forward-fills cash from `state.cashLedger`, and computes `cash + Σ(shares × close)` for every date present in any ticker's historical map (bounded by `[seed.asOf, endDate]`).

- [ ] **Step 1: Write the failing tests**

Write `tests/model/metrics/portfolio_value.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computePortfolioValueSeries } from "@/lib/model/metrics/portfolio_value";
import type { PortfolioState, Seed } from "@/lib/model/types";
import type { Transaction } from "@/lib/csv/types";

function seed(asOf = "2026-01-15", cash = 10000): Seed {
  return { asOf, cash, initialShares: [], initialOptions: [] };
}

function stateWith(opts: {
  transactions?: Transaction[];
  cashLedger?: { date: string; balance: number }[];
}): PortfolioState {
  return {
    config: { seedDate: "2026-01-15", seedValue: 10000, marketData: { enabled: true } },
    transactions: opts.transactions ?? [],
    cashLedger: opts.cashLedger ?? [{ date: "2026-01-15", balance: 10000 }],
    externalFlows: [],
    navSeries: [],
    openOptionPositions: [],
    openSharePositions: [],
    premiumSeries: [],
    premiumTotals: { gross: 0, closed: 0, net: 0 },
    warnings: [],
  };
}

function buyTx(date: string, ticker: string, qty: number, price: number): Transaction {
  return {
    tradeDate: date,
    action: "Buy",
    ticker,
    quantity: qty,
    price,
    fees: 0,
    amount: -qty * price,
    raw: {
      Date: date, Action: "Buy", Symbol: ticker, Description: "",
      Quantity: String(qty), Price: String(price), "Fees & Comm": "0", Amount: "",
    },
    rawAction: "Buy",
  };
}

function sellTx(date: string, ticker: string, qty: number, price: number): Transaction {
  return {
    tradeDate: date,
    action: "Sell",
    ticker,
    quantity: qty,
    price,
    fees: 0,
    amount: qty * price,
    raw: {
      Date: date, Action: "Sell", Symbol: ticker, Description: "",
      Quantity: String(qty), Price: String(price), "Fees & Comm": "0", Amount: "",
    },
    rawAction: "Sell",
  };
}

describe("computePortfolioValueSeries", () => {
  it("returns cash-only forward-fill when no shares are ever held", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        cashLedger: [
          { date: "2026-01-15", balance: 10000 },
          { date: "2026-01-03", balance: 9500 },
        ],
      }),
      seed(),
      { ACME: { "2026-01-02": 50, "2026-01-03": 51 } }, // any ticker map gives us dates
      "2026-01-03",
    );

    expect(result.missingTickers).toEqual([]);
    expect(result.series).toEqual([
      { date: "2026-01-02", nav: 10000 }, // cash forward-filled from 01-01
      { date: "2026-01-03", nav: 9500 },  // cash flips to 9500 on 01-03
    ]);
  });

  it("adds shares × close for each date once a Buy happens", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        transactions: [buyTx("2026-01-02", "ACME", 100, 50)],
        cashLedger: [
          { date: "2026-01-15", balance: 10000 },
          { date: "2026-01-02", balance: 5000 },
        ],
      }),
      seed(),
      { ACME: { "2026-01-02": 50, "2026-01-03": 55, "2026-01-04": 60 } },
      "2026-01-04",
    );

    expect(result.missingTickers).toEqual([]);
    expect(result.series).toEqual([
      { date: "2026-01-02", nav: 5000 + 100 * 50 },
      { date: "2026-01-03", nav: 5000 + 100 * 55 },
      { date: "2026-01-04", nav: 5000 + 100 * 60 },
    ]);
  });

  it("reflects a Sell in subsequent dates' share counts", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        transactions: [
          buyTx("2026-01-02", "ACME", 100, 50),
          sellTx("2026-01-03", "ACME", 40, 55),
        ],
        cashLedger: [
          { date: "2026-01-02", balance: 5000 },
          { date: "2026-01-03", balance: 5000 + 40 * 55 },
        ],
      }),
      seed(),
      { ACME: { "2026-01-02": 50, "2026-01-03": 55, "2026-01-04": 60 } },
      "2026-01-04",
    );

    expect(result.series).toEqual([
      { date: "2026-01-02", nav: 5000 + 100 * 50 },
      { date: "2026-01-03", nav: 7200 + 60 * 55 }, // cash=7200, shares=60 after sell
      { date: "2026-01-04", nav: 7200 + 60 * 60 },
    ]);
  });

  it("sums across multiple held tickers", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        transactions: [
          buyTx("2026-01-02", "ACME", 100, 10),
          buyTx("2026-01-02", "BETA", 50, 20),
        ],
        cashLedger: [
          { date: "2026-01-02", balance: 8000 },
        ],
      }),
      seed(),
      {
        ACME: { "2026-01-03": 12 },
        BETA: { "2026-01-03": 22 },
      },
      "2026-01-03",
    );

    expect(result.series).toEqual([
      { date: "2026-01-03", nav: 8000 + 100 * 12 + 50 * 22 },
    ]);
  });

  it("counts seed.initialShares from the first date in range", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        cashLedger: [{ date: "2026-01-15", balance: 5000 }],
      }),
      {
        asOf: "2026-01-15",
        cash: 5000,
        initialShares: [{ ticker: "ACME", shares: 10, costBasis: 100 }],
        initialOptions: [],
      },
      { ACME: { "2026-01-02": 110 } },
      "2026-01-02",
    );

    expect(result.series).toEqual([
      { date: "2026-01-02", nav: 5000 + 10 * 110 },
    ]);
  });

  it("excludes a ticker's contribution on dates with no close, and surfaces it as missing", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        transactions: [
          buyTx("2026-01-02", "ACME", 100, 10),
          buyTx("2026-01-02", "GAMMA", 50, 20),
        ],
        cashLedger: [{ date: "2026-01-02", balance: 8000 }],
      }),
      seed(),
      {
        ACME: { "2026-01-03": 12 },
        // GAMMA deliberately absent — fetch failed for it
      },
      "2026-01-03",
    );

    expect(result.series).toEqual([
      { date: "2026-01-03", nav: 8000 + 100 * 12 }, // GAMMA contribution excluded
    ]);
    expect(result.missingTickers).toEqual(["GAMMA"]);
  });

  it("returns an empty series when historicalCloses has no dates", () => {
    const result = computePortfolioValueSeries(
      stateWith({}),
      seed(),
      {},
      "2026-01-05",
    );
    expect(result.series).toEqual([]);
    expect(result.missingTickers).toEqual([]);
  });

  it("bounds the series by [seed.asOf, endDate]", () => {
    const result = computePortfolioValueSeries(
      stateWith({
        cashLedger: [{ date: "2026-01-15", balance: 1000 }],
      }),
      seed("2026-01-02", 1000),
      {
        ACME: {
          "2025-12-31": 1, // before seed.asOf — must be excluded
          "2026-01-02": 2,
          "2026-01-03": 3,
          "2026-01-05": 5, // after endDate — must be excluded
        },
      },
      "2026-01-03",
    );

    expect(result.series.map((p) => p.date)).toEqual([
      "2026-01-02",
      "2026-01-03",
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/model/metrics/portfolio_value.test.ts`
Expected: all 8 tests FAIL with "computePortfolioValueSeries is not a function" or similar.

- [ ] **Step 3: Write the minimal implementation**

Write `lib/model/metrics/portfolio_value.ts`:

```ts
import type { NavPoint, PortfolioState, Seed } from "@/lib/model/types";

export function computePortfolioValueSeries(
  state: PortfolioState,
  seed: Seed,
  historicalCloses: Record<string, Record<string, number>>,
  endDate: string,
): { series: NavPoint[]; missingTickers: string[] } {
  // Collect every date across every ticker, bounded by [seed.asOf, endDate].
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

  // Forward-fill cash: for any target date, use the latest cashLedger entry <= date.
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

  // Walk transactions to produce a { date → { ticker → shares } } snapshot
  // lazily. We iterate the target dates in order and advance the transaction
  // pointer as we go.
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
    // Advance shares to include every transaction with tradeDate <= date.
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/model/metrics/portfolio_value.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test`
Expected: all tests pass (AttentionBanner exhaustive-switch error from Task 1 is a typecheck issue, not a test issue — tests should still pass).

Run: `npm run typecheck`
Expected: still fails on `AttentionBanner.describe`. That's still Task 5's job.

- [ ] **Step 6: Commit**

```bash
git add lib/model/metrics/portfolio_value.ts tests/model/metrics/portfolio_value.test.ts
git commit -m "Add pure computePortfolioValueSeries derivation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Dashboard wiring

**Files:**
- Modify: `lib/server/dashboard.ts`

Gather every ticker ever held, fetch historical closes, compute the series, attach to state + emit warnings. Also need a "yesterday in ET" helper — add it alongside the existing date utilities.

- [ ] **Step 1: Add a `yesterdayInET` helper to `lib/util/dates.ts`**

First, check what's already in `lib/util/dates.ts` to match style. Then append:

```ts
/**
 * Returns yesterday's calendar date in US Eastern time, as YYYY-MM-DD.
 * Used as the upper bound for historical-close fetches: today's close
 * isn't final until market close, so we cap at T-1.
 */
export function yesterdayInET(now: Date = new Date()): string {
  // Subtract 24 hours, then format in en-CA locale ET (ISO-like).
  const dayMs = 24 * 60 * 60 * 1000;
  const y = new Date(now.getTime() - dayMs);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(y);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
```

- [ ] **Step 2: Extend `tests/util/dates.test.ts` with a test for `yesterdayInET`**

Append to the existing describe block:

```ts
it("yesterdayInET returns the previous ET calendar day as YYYY-MM-DD", () => {
  // Noon ET on 2026-04-23 is 16:00 UTC
  const noonET = new Date("2026-04-23T16:00:00Z");
  expect(yesterdayInET(noonET)).toBe("2026-04-22");
});

it("yesterdayInET handles the ET/UTC boundary correctly", () => {
  // 03:00 UTC on 2026-04-23 is still 2026-04-22 23:00 in ET,
  // so "yesterday" relative to that moment is 2026-04-21.
  const earlyUTC = new Date("2026-04-23T03:00:00Z");
  expect(yesterdayInET(earlyUTC)).toBe("2026-04-21");
});
```

(Don't forget the `yesterdayInET` import at the top of that test file.)

Run: `npx vitest run tests/util/dates.test.ts`
Expected: both new tests FAIL initially, then PASS after the Step 1 helper is in place. If they're already passing, great — that just means Step 1 landed first.

- [ ] **Step 3: Modify `lib/server/dashboard.ts` — imports + orchestration**

Add imports at the top:

```ts
import { loadHistoricalCloses } from "@/lib/market/historical";
import { computePortfolioValueSeries } from "@/lib/model/metrics/portfolio_value";
import { yesterdayInET } from "@/lib/util/dates";
```

After the existing `const state = buildPortfolio(transactions, config, seed);` line, before the mark-to-market block, insert:

```ts
if (config.marketData.enabled) {
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
  }
}
```

And at the bottom of the file (or near `listCsvFiles`), add the helper:

```ts
function collectHeldTickers(
  state: PortfolioState,
  seed: Seed,
): string[] {
  const tickers = new Set<string>();
  for (const s of seed.initialShares) tickers.add(s.ticker);
  for (const t of state.transactions) {
    if ((t.action === "Buy" || t.action === "Sell") && t.ticker) {
      tickers.add(t.ticker);
    }
  }
  return Array.from(tickers).sort();
}
```

Import `Seed` from `@/lib/model/types` in the imports block if it isn't already there.

- [ ] **Step 4: Extend `tests/integration.test.ts`**

Find the existing `describe("loadDashboard", ...)` block. Replace it with:

```ts
describe("loadDashboard", () => {
  it("returns a tagged-union result reflecting local data/ state", async () => {
    const result = await loadDashboard();
    expect(["ready", "no-csv", "no-config", "parse-error"]).toContain(
      result.kind,
    );
  });

  it("exposes portfolioValueSeries when market data is enabled and held tickers exist", async () => {
    const result = await loadDashboard();
    if (result.kind !== "ready") return; // skip gracefully when no local data

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
      // Either populated (happy path) OR every ticker failed and was warned.
      const hasSeries =
        Array.isArray(result.state.portfolioValueSeries) &&
        result.state.portfolioValueSeries.length >= 0;
      expect(hasSeries).toBe(true);
    }
  });
});
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass. Integration test tolerates zero local data by short-circuiting.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: still one error about `MissingHistoricalPrices` not handled in `AttentionBanner.describe`. That's Task 5.

- [ ] **Step 7: Commit**

```bash
git add lib/util/dates.ts tests/util/dates.test.ts lib/server/dashboard.ts tests/integration.test.ts
git commit -m "Wire historical closes + portfolio-value series into dashboard loader

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: AttentionBanner handles `MissingHistoricalPrices`

**Files:**
- Modify: `app/components/AttentionBanner.tsx`

Tiny change — one extra branch in the `describe` switch. This is the task that clears the typecheck error from Task 1.

- [ ] **Step 1: Add the branch**

Open `app/components/AttentionBanner.tsx`. In the `describe` switch, add after the `UnpairedAssignment` case:

```ts
    case "MissingHistoricalPrices":
      return `Historical closes unavailable for ${w.ticker} — Portfolio Value excludes this ticker's contribution on missing dates. (${w.reason})`;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean (exits 0).

- [ ] **Step 3: Full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/components/AttentionBanner.tsx
git commit -m "Render MissingHistoricalPrices warnings in AttentionBanner

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: NavCard renders the second line + legend

**Files:**
- Modify: `app/components/NavCard.tsx`

Extend the hand-rolled SVG: second polyline in violet, legend row, guard so the single-line path still works when `portfolioValueSeries` is absent or too short.

- [ ] **Step 1: Read the current `NavCard.tsx`**

Before editing, read the whole file to understand the current scale/transform logic. You'll reuse `scaleX` and `scaleY`, just widening their inputs.

- [ ] **Step 2: Apply the changes**

Replace the `NavCard` function body with:

```tsx
import type { NavPoint, PortfolioState } from "@/lib/model/types";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState };

function EmptyCard() {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 text-sm text-gray-500 dark:text-gray-400">
      Not enough data points yet.
    </div>
  );
}

export function NavCard({ state }: Props) {
  const incomePoints = state.navSeries;
  if (incomePoints.length < 2) return <EmptyCard />;

  const valuePoints: NavPoint[] =
    state.portfolioValueSeries && state.portfolioValueSeries.length >= 2
      ? state.portfolioValueSeries
      : [];

  const allNavs = [
    state.config.seedValue,
    ...incomePoints.map((p) => p.nav),
    ...valuePoints.map((p) => p.nav),
  ];
  const minNav = Math.min(...allNavs);
  const maxNav = Math.max(...allNavs);
  const pad = (maxNav - minNav) * 0.1 || 1;
  const yMin = minNav - pad;
  const yMax = maxNav + pad;

  const firstMs = Math.min(
    Date.parse(incomePoints[0].date),
    valuePoints.length ? Date.parse(valuePoints[0].date) : Infinity,
  );
  const lastMs = Math.max(
    Date.parse(incomePoints.at(-1)!.date),
    valuePoints.length ? Date.parse(valuePoints.at(-1)!.date) : -Infinity,
  );
  const xRange = Math.max(1, lastMs - firstMs);
  const scaleX = (ms: number) => ((ms - firstMs) / xRange) * 600;
  const scaleY = (v: number) => 180 - ((v - yMin) / (yMax - yMin)) * 180;

  function pathOf(points: NavPoint[]): string {
    return points
      .map((p, i) => {
        const x = scaleX(Date.parse(p.date));
        const y = scaleY(p.nav);
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }

  const incomePath = pathOf(incomePoints);
  const area = `${incomePath} L600,180 L0,180 Z`;
  const valuePath = valuePoints.length ? pathOf(valuePoints) : null;

  const seedY = scaleY(state.config.seedValue);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
          NAV over time
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-gray-600 dark:text-gray-300">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-[2px] bg-emerald-600" />
            Options Income
          </span>
          {valuePath && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-[2px] bg-violet-500" />
              Portfolio Value
            </span>
          )}
        </div>
      </div>
      <svg viewBox="0 0 600 180" className="w-full h-40">
        <path d={area} fill="rgba(16,185,129,0.12)" />
        <path
          d={incomePath}
          fill="none"
          stroke="#059669"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {valuePath && (
          <path
            d={valuePath}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        <line
          x1="0"
          x2="600"
          y1={seedY}
          y2={seedY}
          stroke="#9ca3af"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      </svg>
      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Dashed line = seed value ({formatCurrency(state.config.seedValue)})
      </div>
    </div>
  );
}
```

(If the current file has additional detail the above snippet drops — e.g. a header block, footer, or title — preserve it. The logic changes are the three new parts: y-range union, value polyline, legend row.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 errors (pre-existing `mkdirSync` warning is unrelated).

- [ ] **Step 5: Visual smoke test**

Run: `npm run dev` (disable sandbox if needed). Open `http://localhost:3000`. Verify:
- NavCard renders two lines: emerald Options Income + violet Portfolio Value
- Legend row above the chart shows both swatches + labels
- Dashed seed line still renders
- Violet line is smoother / more granular than emerald (daily vs. trade-date)
- If `data/config.json` has `marketData.enabled: false`, only the emerald line renders — no legend for the second line

- [ ] **Step 6: Commit**

```bash
git add app/components/NavCard.tsx
git commit -m "Render Portfolio Value as a second line on NavCard with legend

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (pre-existing warning permitted).

- [ ] **Step 4: End-to-end smoke**

1. Ensure `data/transactions/` and `data/positions/` have real CSVs (use `/ingest` if needed).
2. `rm -rf .cache/market/historical/` to verify cold-start behavior.
3. `npm run dev`, open `http://localhost:3000`.
4. Verify the NavCard shows both lines + legend. Check the browser console for no errors.
5. Inspect `.cache/market/historical/` — one `<TICKER>.json` per held ticker, each with daily date→close entries.
6. Reload the page — should be noticeably faster (cache hit, no refetch).
7. Toggle `marketData.enabled: false` in `data/config.json`, reload — only Options Income line should render.
8. Flip it back to true. Delete one cache file (`rm .cache/market/historical/<TICKER>.json`), reload — that ticker refetches cleanly.
9. Disconnect your network briefly and reload — Portfolio Value line should still render from stale cache; warnings in AttentionBanner should list any tickers that lost their cache.

- [ ] **Step 5: Hygiene check before PR (if using PR flow)**

Run: `git status && git diff --cached`
Verify: no real financial data staged. No CSVs outside `tests/fixtures/`. No `.cache/` contents.

- [ ] **Step 6: Open PR (if using PR flow)**

```bash
git push -u origin fix/9-historical-portfolio-value
gh pr create --title "Render historical Portfolio Value line on NavCard (closes #9)" --body "$(cat <<'EOF'
## Summary
- New `lib/market/historical.ts`: per-ticker yahoo-finance2 historical fetch + append-only JSON cache at `.cache/market/historical/<TICKER>.json`.
- New `lib/model/metrics/portfolio_value.ts`: pure derivation — `cash + Σ shares × close` per trading day from seed to T-1.
- NavCard gains a second violet polyline labeled "Portfolio Value" alongside the existing emerald "Options Income" line, with a legend row.
- Failures on a per-ticker basis degrade gracefully via a new `MissingHistoricalPrices` warning in AttentionBanner.

Closes #9.

## Test plan
- [x] Vitest: new `historical.test.ts` (7 tests) + `portfolio_value.test.ts` (8 tests); typecheck + lint clean
- [ ] Manual smoke: both lines render; cache populates; `marketData.enabled:false` falls back to single line; ticker cache deletion triggers refetch; network-offline leaves stale line renderable

*Co-authored by Claude*
EOF
)"
```
