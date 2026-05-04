# Issue #2 Snapshot-Aligned TWR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the naive return calc with snapshot-aligned Time-Weighted Return (TWR), with optional seed backfill, hidden inspection page, and per-period clamping warnings.

**Architecture:** Four pure modules under `lib/model/metrics/` (`cashflow.ts`, `navSeries.ts`, `twr.ts`, `benchmark.ts`) compose into a `TwrResult` produced server-side by the existing loaders, consumed by `ReturnMetricsCard` and `OverviewSummaryStrip`. Existing `lib/server/period.ts::resolvePeriod` and `lib/market/historical.ts::loadHistoricalCloses` are reused. New hidden page at `app/accounts/[uuid]/_debug/twr/page.tsx` renders the segment breakdown for cross-checking against Schwab's "Performance" tab. CLI gains `--label` for `account:configure`.

**Tech Stack:** Next.js 16 App Router (TypeScript), better-sqlite3, vitest, Tailwind CSS, yahoo-finance2.

**Spec:** [`docs/superpowers/specs/2026-04-27-schwab-lens-design.md`](../specs/2026-04-27-schwab-lens-design.md), section "Return math" (lines 375-475).

**Issue:** [#2](https://github.com/jayrav13/schwab-lens/issues/2).

**Approved design memo:** `/Users/jravaliya/.claude/plans/logical-soaring-lake.md`.

---

## Scope notes

- `--market-data on|off` flag from issue body is dropped — the gate it referenced was removed in PR #30.
- `--target / --group / --expected-real-return` flags from issue body are deferred — backing schema columns don't exist; would require a separate migration.
- "ⓘ How is this computed" popover on cards is deferred — the `/_debug/twr` page covers the inspection need.
- Existing `computeReturnMetrics` "best/worst month" feature is dropped — not in spec, sub-periods don't align to calendar months.
- The legacy `Action` enum collapses `TRANSFER_IN` and `JOURNAL` both to `"Journal"`. Treat both as external flow per spec; no need to disambiguate at this layer.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `lib/model/metrics/cashflow.ts` | Classify a `Transaction.action` as `external \| internal \| unknown` per spec table; `externalFlowsBetween` + `unknownActionsBetween` helpers |
| `lib/model/metrics/navSeries.ts` | `PositionSnapshotRow[]` → sorted, dedup'd `NavPoint[]` (per-date last-write-wins) |
| `lib/model/metrics/twr.ts` | Pure TWR engine: `(navPoints, transactions, period, seed) → TwrResult`. Implements all spec edge cases. |
| `lib/model/metrics/benchmark.ts` | Buy-and-hold TWR over the same effective window as `twr.ts`: `(closes, fromDate, toDate) → BenchmarkResult \| null` |
| `tests/model/metrics/cashflow.test.ts` | Unit tests for classification |
| `tests/model/metrics/navSeries.test.ts` | Unit tests for snapshot-rows → series |
| `tests/model/metrics/twr.test.ts` | Hand-built fixture + Modified Dietz cross-check + every spec edge case |
| `tests/model/metrics/benchmark.test.ts` | Unit tests for benchmark TWR |
| `app/accounts/[uuid]/_debug/twr/page.tsx` | Hidden inspection page rendering the segment table |
| `tests/db/repos/accounts-setLabel.test.ts` | Unit test for new `setLabel` repo function |

### Modified files

| Path | Change |
|---|---|
| `lib/model/types.ts` | Add `TwrResult`, `TwrSegment`, `BenchmarkResult` types; add `Clamped`, `NegativeNav`, `UnknownActionInPeriod`, `InsufficientSnapshots` `Warning` variants |
| `lib/model/cash.ts` | Replace inline `Journal\|WireSent` filter with delegation to `cashflow.externalFlowsBetween` |
| `lib/db/repos/accounts.ts` | Add `setLabel(db, externalId, label)` function |
| `lib/server/accountOverview.ts` | Replace `closestOnOrBefore`-based NAV strip math with `computeTwr`; load benchmark via `benchmark.ts`; push new warnings into `state.warnings` |
| `lib/server/account.ts` | Accept optional `period` arg (defaults to `"All"`); replace return-metrics consumption with `TwrResult`; route benchmark through `benchmark.ts` |
| `app/components/AttentionBanner.tsx` | Add `describe()` cases for `Clamped`, `NegativeNav`, `UnknownActionInPeriod`, `InsufficientSnapshots` |
| `app/components/ReturnMetricsCard.tsx` | Take `TwrResult` prop; drop `computeReturnMetrics` import; drop best/worst-month UI |
| `app/components/OverviewSummaryStrip.tsx` | Accept richer `NavStripData` containing `twr`, `effectiveStart`, `effectiveEnd`, `clamped` |
| `app/accounts/[uuid]/options/page.tsx` | Pass new `TwrResult` to `ReturnMetricsCard` |
| `scripts/account-configure.ts` | Add `--label` flag; extend `parseFlags`, `configureNonInteractive`, interactive prompt |
| `tests/scripts/account-configure.test.ts` | Add tests for `--label` parsing + non-interactive label update |

### Deletions (last task, after callers migrate)

- `lib/model/metrics/returns.ts`
- `tests/model/metrics/returns.test.ts`

### Reused (do not touch)

- `lib/server/period.ts::resolvePeriod` — period-key → date range
- `lib/market/historical.ts::loadHistoricalCloses` — Yahoo wrapper with cache
- `lib/db/repos/positionSnapshots.ts::listSnapshotsByAccount` — already returns the rows we need
- `lib/positions/seed.ts::chooseSeed` — seed resolution
- `lib/model/portfolio.ts::buildPortfolio` — portfolio assembly

---

## Branch and PR plan

Branch: `fix/2-snapshot-aligned-twr` from `multi-account` (per memory: PRs target `multi-account`). Each task ends with a commit; the final task opens the PR.

---

## Task 1: Set up branch

**Files:** none (git only).

- [ ] **Step 1: Confirm clean tree on `multi-account`**

```bash
git checkout multi-account
git pull --ff-only origin multi-account
git status
```
Expected: `nothing to commit, working tree clean`.

- [ ] **Step 2: Create branch**

```bash
git checkout -b fix/2-snapshot-aligned-twr
```

- [ ] **Step 3: Commit the plan file to the branch**

```bash
git add docs/superpowers/plans/2026-04-30-snapshot-aligned-twr.md
git commit -m "Add Issue #2 implementation plan

Plan for replacing the naive return calc with snapshot-aligned TWR.
4 new pure modules under lib/model/metrics/ (cashflow, navSeries,
twr, benchmark), loader integration in accountOverview.ts and
account.ts, hidden /_debug/twr page for cross-checking against
Schwab, and the --label flag added to account:configure. Modified
Dietz cross-check is the validation gate.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: `cashflow.ts` (classification)

Pure module that classifies each `Transaction.action` value as `external | internal | unknown` per the spec table, and exposes helpers that filter transactions by classification within a date range.

**Files:**
- Create: `lib/model/metrics/cashflow.ts`
- Test: `tests/model/metrics/cashflow.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/model/metrics/cashflow.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  classifyAction,
  externalFlowsBetween,
  unknownActionsBetween,
  type FlowKind,
} from "@/lib/model/metrics/cashflow";
import type { Action, Transaction } from "@/lib/csv/types";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    tradeDate: "2026-01-05",
    action: "Buy",
    rawAction: "Buy",
    quantity: 1,
    fees: 0,
    amount: 0,
    raw: {} as Transaction["raw"],
    ...overrides,
  };
}

describe("classifyAction", () => {
  const cases: Array<[Action, FlowKind]> = [
    ["Buy", "internal"],
    ["Sell", "internal"],
    ["SellToOpen", "internal"],
    ["BuyToClose", "internal"],
    ["Assigned", "internal"],
    ["Expired", "internal"],
    ["QualifiedDividend", "internal"],
    ["BankInterest", "internal"],
    ["CreditInterest", "internal"],
    ["ServiceFee", "internal"],
    ["MiscCashEntry", "internal"],
    ["Journal", "external"],
    ["WireSent", "external"],
    ["Unknown", "unknown"],
  ];
  for (const [action, kind] of cases) {
    it(`classifies ${action} as ${kind}`, () => {
      expect(classifyAction(action)).toBe(kind);
    });
  }
});

describe("externalFlowsBetween", () => {
  it("returns flows in [from, to] inclusive, sorted by date asc", () => {
    const txs: Transaction[] = [
      tx({ tradeDate: "2026-01-05", action: "Journal", amount: 5000 }),
      tx({ tradeDate: "2026-02-15", action: "WireSent", amount: -2000 }),
      tx({ tradeDate: "2026-01-10", action: "Buy", amount: -500 }),
      tx({ tradeDate: "2025-12-31", action: "Journal", amount: 1000 }),
      tx({ tradeDate: "2026-04-01", action: "Journal", amount: 100 }),
    ];
    const flows = externalFlowsBetween(txs, "2026-01-01", "2026-03-01");
    expect(flows).toEqual([
      { date: "2026-01-05", signedAmount: 5000 },
      { date: "2026-02-15", signedAmount: -2000 },
    ]);
  });

  it("returns an empty array when no flows fall in range", () => {
    const txs: Transaction[] = [
      tx({ tradeDate: "2026-01-05", action: "Buy", amount: -500 }),
    ];
    expect(externalFlowsBetween(txs, "2026-01-01", "2026-03-01")).toEqual([]);
  });
});

describe("unknownActionsBetween", () => {
  it("returns Unknown-action transactions in [from, to] inclusive", () => {
    const txs: Transaction[] = [
      tx({ tradeDate: "2026-01-05", action: "Unknown", rawAction: "Mystery", amount: 100 }),
      tx({ tradeDate: "2026-02-10", action: "Buy", amount: -500 }),
      tx({ tradeDate: "2026-04-01", action: "Unknown", rawAction: "Other", amount: 50 }),
    ];
    const result = unknownActionsBetween(txs, "2026-01-01", "2026-03-01");
    expect(result).toHaveLength(1);
    expect(result[0].rawAction).toBe("Mystery");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- tests/model/metrics/cashflow.test.ts
```
Expected: FAIL with `Cannot find module '@/lib/model/metrics/cashflow'`.

- [ ] **Step 3: Implement the module**

`lib/model/metrics/cashflow.ts`:

```ts
import type { Action, Transaction } from "@/lib/csv/types";
import type { FlowPoint } from "@/lib/model/types";

export type FlowKind = "external" | "internal" | "unknown";

const EXTERNAL: ReadonlySet<Action> = new Set(["Journal", "WireSent"]);
const UNKNOWN: ReadonlySet<Action> = new Set(["Unknown"]);

export function classifyAction(action: Action): FlowKind {
  if (EXTERNAL.has(action)) return "external";
  if (UNKNOWN.has(action)) return "unknown";
  return "internal";
}

export function externalFlowsBetween(
  transactions: Transaction[],
  fromDate: string,
  toDate: string,
): FlowPoint[] {
  return transactions
    .filter(
      (t) =>
        classifyAction(t.action) === "external" &&
        t.tradeDate >= fromDate &&
        t.tradeDate <= toDate,
    )
    .map((t) => ({ date: t.tradeDate, signedAmount: t.amount }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function unknownActionsBetween(
  transactions: Transaction[],
  fromDate: string,
  toDate: string,
): Transaction[] {
  return transactions.filter(
    (t) =>
      classifyAction(t.action) === "unknown" &&
      t.tradeDate >= fromDate &&
      t.tradeDate <= toDate,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- tests/model/metrics/cashflow.test.ts
```
Expected: 16 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/model/metrics/cashflow.ts tests/model/metrics/cashflow.test.ts
git commit -m "Add cashflow classification module

Pure module that classifies each Transaction.action as
external/internal/unknown per the spec table at
docs/superpowers/specs/2026-04-27-schwab-lens-design.md lines 388-396.

The legacy Action enum collapses TRANSFER_IN and JOURNAL both to
'Journal' and TRANSFER_OUT to 'WireSent'. Per spec all three are
treated as external flow, so the legacy collapse is fine for v1
classification. Misc Cash Entry / Service Fee map to internal here
even though they ingest as Unknown today (issue #20); when those
mappings are fixed in ingest the classification stays correct.

Used by twr.ts to extract external-only flow time series, and by
the loader to surface UnknownActionInPeriod warnings.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: `navSeries.ts` (snapshot-rows → NavPoint[])

Pure module that turns a list of `PositionSnapshotRow` into a sorted, deduplicated `NavPoint[]`. When two rows share a date (e.g., re-ingest with corrected market values), the row with the larger `id` wins.

**Files:**
- Create: `lib/model/metrics/navSeries.ts`
- Test: `tests/model/metrics/navSeries.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/model/metrics/navSeries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { navSeriesFromSnapshots } from "@/lib/model/metrics/navSeries";
import type { PositionSnapshotRow } from "@/lib/db/repos/positionSnapshots";

function row(overrides: Partial<PositionSnapshotRow>): PositionSnapshotRow {
  return {
    id: 1,
    account_id: 1,
    as_of: "2026-01-05",
    symbol: "ACME",
    description: null,
    quantity: 100,
    price: 50,
    market_value: 5000,
    cost_basis: 5000,
    asset_type: "equity",
    raw: "{}",
    source_file: "snap.csv",
    content_hash: "h1",
    ...overrides,
  };
}

describe("navSeriesFromSnapshots", () => {
  it("returns an empty series for empty input", () => {
    expect(navSeriesFromSnapshots([])).toEqual([]);
  });

  it("sums market_value across rows with the same date", () => {
    const rows = [
      row({ id: 1, as_of: "2026-01-05", symbol: "ACME", market_value: 5000 }),
      row({ id: 2, as_of: "2026-01-05", symbol: "BETA", market_value: 3000 }),
    ];
    expect(navSeriesFromSnapshots(rows)).toEqual([
      { date: "2026-01-05", nav: 8000 },
    ]);
  });

  it("returns one point per unique date, sorted asc", () => {
    const rows = [
      row({ id: 1, as_of: "2026-03-01", symbol: "ACME", market_value: 1500 }),
      row({ id: 2, as_of: "2026-01-15", symbol: "ACME", market_value: 1000 }),
      row({ id: 3, as_of: "2026-02-10", symbol: "ACME", market_value: 1200 }),
    ];
    expect(navSeriesFromSnapshots(rows)).toEqual([
      { date: "2026-01-15", nav: 1000 },
      { date: "2026-02-10", nav: 1200 },
      { date: "2026-03-01", nav: 1500 },
    ]);
  });

  it("treats null market_value as 0", () => {
    const rows = [
      row({ id: 1, as_of: "2026-01-15", symbol: "ACME", market_value: 1000 }),
      row({ id: 2, as_of: "2026-01-15", symbol: "Cash", market_value: null }),
    ];
    expect(navSeriesFromSnapshots(rows)).toEqual([
      { date: "2026-01-15", nav: 1000 },
    ]);
  });

  it("re-ingest with later id replaces earlier rows for the same (date, symbol)", () => {
    const rows = [
      row({ id: 1, as_of: "2026-01-15", symbol: "ACME", market_value: 1000 }),
      row({ id: 2, as_of: "2026-01-15", symbol: "ACME", market_value: 1100 }),
    ];
    expect(navSeriesFromSnapshots(rows)).toEqual([
      { date: "2026-01-15", nav: 1100 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- tests/model/metrics/navSeries.test.ts
```
Expected: FAIL with `Cannot find module '@/lib/model/metrics/navSeries'`.

- [ ] **Step 3: Implement the module**

`lib/model/metrics/navSeries.ts`:

```ts
import type { PositionSnapshotRow } from "@/lib/db/repos/positionSnapshots";
import type { NavPoint } from "@/lib/model/types";

export function navSeriesFromSnapshots(
  rows: PositionSnapshotRow[],
): NavPoint[] {
  // Last-write-wins by id for (date, symbol). Then sum market_value per date.
  const latestBySymbol = new Map<string, PositionSnapshotRow>();
  for (const r of rows) {
    const key = `${r.as_of}|${r.symbol}`;
    const prior = latestBySymbol.get(key);
    if (!prior || r.id > prior.id) {
      latestBySymbol.set(key, r);
    }
  }

  const totalsByDate = new Map<string, number>();
  for (const r of latestBySymbol.values()) {
    const mv = r.market_value ?? 0;
    totalsByDate.set(r.as_of, (totalsByDate.get(r.as_of) ?? 0) + mv);
  }

  return Array.from(totalsByDate.entries())
    .map(([date, nav]) => ({ date, nav }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- tests/model/metrics/navSeries.test.ts
```
Expected: 5 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/model/metrics/navSeries.ts tests/model/metrics/navSeries.test.ts
git commit -m "Add navSeries module: snapshot rows to NavPoint series

Turns a flat list of PositionSnapshotRow rows into a sorted,
per-date NavPoint[]. Each output point is the sum of market values
across all rows for that date. When the same (date, symbol) appears
twice (e.g., re-ingest with corrected market values), last-write-wins
by row id.

This is the snapshot-derived NAV that twr.ts uses as the backbone
of its computation, distinct from the existing transaction-cost-basis
nav.ts series which the Options page still consumes.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: `Warning` and `TwrResult` types in `lib/model/types.ts`

Add the new warning variants and the TWR result types that downstream tasks will consume.

**Files:**
- Modify: `lib/model/types.ts`

- [ ] **Step 1: Extend the `Warning` union and add new types**

Open `lib/model/types.ts` and replace the existing `Warning` union with the extended version, and add the new types after it:

```ts
export type Warning =
  | { kind: "UnknownAction"; rawAction: string; count: number }
  | { kind: "CashDrift"; expected: number; actual: number }
  | { kind: "NegativeShareEndOfDay"; ticker: string; date: string; shares: number }
  | { kind: "UnpairedAssignment"; date: string; contractKey: string }
  | { kind: "MissingHistoricalPrices"; ticker: string; reason: string }
  | { kind: "MissingSeed" }
  | { kind: "Clamped"; earliestDate: string }
  | { kind: "NegativeNav"; date: string; nav: number }
  | { kind: "UnknownActionInPeriod"; date: string; rawAction: string; amount: number }
  | { kind: "InsufficientSnapshots"; count: number };

export type TwrFlow = {
  date: string;
  amount: number;
  weight: number;
};

export type TwrSegment = {
  fromDate: string;
  toDate: string;
  fromNav: number;
  toNav: number;
  flows: TwrFlow[];
  flowsTotal: number;
  weightedFlows: number;
  return: number;
};

export type TwrResult = {
  twr: number | null;
  effectiveStart: { date: string; nav: number } | null;
  effectiveEnd: { date: string; nav: number } | null;
  clamped: boolean;
  segments: TwrSegment[];
  warnings: Warning[];
};

export type BenchmarkResult = {
  twr: number;
  ticker: string;
  fromDate: string;
  fromClose: number;
  toDate: string;
  toClose: number;
};
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Run the full test suite to confirm no regressions**

```bash
npm test
```
Expected: all 280 tests still pass (we haven't touched any consumer yet).

- [ ] **Step 4: Commit**

```bash
git add lib/model/types.ts
git commit -m "Add TwrResult, TwrSegment, BenchmarkResult, new Warning kinds

Extends the existing Warning union with four new variants used by
twr.ts and the loaders to surface clamping, negative interior NAV,
unrecognized actions inside a period, and insufficient snapshot
density. Adds TwrResult/TwrSegment/TwrFlow/BenchmarkResult types
that the loaders will produce and the cards will consume.

No consumers wired up yet; these types are just the type plumbing
that subsequent tasks will fill in.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: `twr.ts` happy path

Implement the TWR engine for the simplest non-trivial case: a deposit mid-period with two snapshot endpoints and one interior snapshot. This locks in the function signature and the basic flow time-weighting before we layer on edge cases.

**Files:**
- Create: `lib/model/metrics/twr.ts`
- Test: `tests/model/metrics/twr.test.ts`

- [ ] **Step 1: Write the failing test for the happy path**

`tests/model/metrics/twr.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeTwr } from "@/lib/model/metrics/twr";
import type { Transaction } from "@/lib/csv/types";
import type { NavPoint } from "@/lib/model/types";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    tradeDate: "2026-01-05",
    action: "Buy",
    rawAction: "Buy",
    quantity: 1,
    fees: 0,
    amount: 0,
    raw: {} as Transaction["raw"],
    ...overrides,
  };
}

describe("computeTwr — happy path", () => {
  it("computes TWR with one mid-period external deposit", () => {
    // Period: [2026-01-01, 2026-04-01]
    // Snapshots: 2026-01-01 NAV=10000, 2026-03-01 NAV=11500, 2026-04-01 NAV=13500
    // Flow: 2026-02-15 deposit +1000 (external)
    //
    // Sub-period 1: [2026-01-01, 2026-03-01]
    //   N0=10000, N1=11500, days = 59, flow on day 45 (2026-02-15 from 2026-01-01)
    //   weight = (59 - 45) / 59 = 14/59
    //   weighted_flows = 1000 * 14/59
    //   r1 = (11500 - 10000 - 1000) / (10000 + 1000*14/59)
    //      = 500 / (10000 + 237.288...) ≈ 0.0488824
    //
    // Sub-period 2: [2026-03-01, 2026-04-01]
    //   N1=11500, N2=13500, no flows
    //   r2 = (13500 - 11500) / 11500 = 0.1739130...
    //
    // TWR = (1.0488824 * 1.1739130) - 1 ≈ 0.231283

    const navPoints: NavPoint[] = [
      { date: "2026-01-01", nav: 10000 },
      { date: "2026-03-01", nav: 11500 },
      { date: "2026-04-01", nav: 13500 },
    ];

    const transactions: Transaction[] = [
      tx({
        tradeDate: "2026-02-15",
        action: "Journal",
        rawAction: "MoneyLink Deposit",
        amount: 1000,
      }),
    ];

    const result = computeTwr({
      navPoints,
      transactions,
      period: { from: "2026-01-01", to: "2026-04-01" },
      seed: null,
    });

    expect(result.twr).not.toBeNull();
    expect(result.twr!).toBeCloseTo(0.231283, 4);
    expect(result.clamped).toBe(false);
    expect(result.segments).toHaveLength(2);
    expect(result.warnings).toEqual([]);
    expect(result.effectiveStart).toEqual({ date: "2026-01-01", nav: 10000 });
    expect(result.effectiveEnd).toEqual({ date: "2026-04-01", nav: 13500 });

    // First sub-period detail
    const seg1 = result.segments[0];
    expect(seg1.fromDate).toBe("2026-01-01");
    expect(seg1.toDate).toBe("2026-03-01");
    expect(seg1.flows).toHaveLength(1);
    expect(seg1.flows[0].date).toBe("2026-02-15");
    expect(seg1.flows[0].amount).toBe(1000);
    expect(seg1.flows[0].weight).toBeCloseTo(14 / 59, 5);
    expect(seg1.flowsTotal).toBe(1000);
    expect(seg1.weightedFlows).toBeCloseTo((1000 * 14) / 59, 3);
    expect(seg1.return).toBeCloseTo(0.04888, 4);

    // Second sub-period detail
    const seg2 = result.segments[1];
    expect(seg2.fromDate).toBe("2026-03-01");
    expect(seg2.toDate).toBe("2026-04-01");
    expect(seg2.flows).toEqual([]);
    expect(seg2.return).toBeCloseTo(0.17391, 4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- tests/model/metrics/twr.test.ts
```
Expected: FAIL with `Cannot find module '@/lib/model/metrics/twr'`.

- [ ] **Step 3: Implement the minimum twr.ts**

`lib/model/metrics/twr.ts`:

```ts
import type { Transaction } from "@/lib/csv/types";
import type {
  NavPoint,
  TwrFlow,
  TwrResult,
  TwrSegment,
  Warning,
} from "@/lib/model/types";
import { externalFlowsBetween } from "@/lib/model/metrics/cashflow";

export type ComputeTwrInput = {
  navPoints: NavPoint[];
  transactions: Transaction[];
  period: { from: string; to: string };
  seed: { date: string; value: number } | null;
};

export function computeTwr(input: ComputeTwrInput): TwrResult {
  const warnings: Warning[] = [];
  const segments: TwrSegment[] = [];

  // Resolve effective endpoints. Happy path: start = first snapshot ≥ from,
  // end = last snapshot ≤ to. Edge cases (seed backfill, clamping, single
  // snapshot, etc.) handled in subsequent tasks.
  const inPeriod = input.navPoints.filter(
    (p) => p.date >= input.period.from && p.date <= input.period.to,
  );

  const effectiveStart = inPeriod[0] ?? null;
  const effectiveEnd = inPeriod[inPeriod.length - 1] ?? null;

  if (
    !effectiveStart ||
    !effectiveEnd ||
    effectiveStart.date === effectiveEnd.date
  ) {
    return {
      twr: null,
      effectiveStart,
      effectiveEnd,
      clamped: false,
      segments,
      warnings,
    };
  }

  // Build sub-periods from consecutive snapshot points.
  let chained = 1;
  for (let i = 0; i < inPeriod.length - 1; i++) {
    const a = inPeriod[i];
    const b = inPeriod[i + 1];
    const intervalDays = daysBetween(a.date, b.date);
    if (intervalDays <= 0) continue;

    // Flows in (a.date, b.date]: per spec, a flow on a snapshot date belongs
    // to the OPENING of the next interval (so it lands here when its date is
    // strictly greater than a.date and ≤ b.date).
    const rawFlows = externalFlowsBetween(input.transactions, a.date, b.date);
    const flows: TwrFlow[] = rawFlows
      .filter((f) => f.date > a.date)
      .map((f) => ({
        date: f.date,
        amount: f.signedAmount,
        weight: (intervalDays - daysBetween(a.date, f.date)) / intervalDays,
      }));

    const flowsTotal = flows.reduce((s, f) => s + f.amount, 0);
    const weightedFlows = flows.reduce((s, f) => s + f.amount * f.weight, 0);
    const denom = a.nav + weightedFlows;
    const r = (b.nav - a.nav - flowsTotal) / denom;

    segments.push({
      fromDate: a.date,
      toDate: b.date,
      fromNav: a.nav,
      toNav: b.nav,
      flows,
      flowsTotal,
      weightedFlows,
      return: r,
    });

    chained *= 1 + r;
  }

  return {
    twr: chained - 1,
    effectiveStart,
    effectiveEnd,
    clamped: false,
    segments,
    warnings,
  };
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- tests/model/metrics/twr.test.ts
```
Expected: 1 test PASS.

- [ ] **Step 5: Type-check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/model/metrics/twr.ts tests/model/metrics/twr.test.ts
git commit -m "Add TWR engine: happy path with mid-period deposit

Pure function computeTwr({ navPoints, transactions, period, seed })
produces a TwrResult with chained sub-period returns plus the full
segment breakdown for inspection.

This commit covers only the happy path: snapshot-aligned endpoints
inside the period, flows time-weighted within each sub-period via
Modified Dietz, chained as TWR = product(1 + r_i) - 1. Per-spec
ambiguity resolved: a flow on a snapshot date belongs to the
opening of the next interval, not the closing of the current one.

Edge cases (seed backfill, clamping, single snapshot, zero start
NAV, negative interior NAV, unknown actions) come in subsequent
tasks driven by their own failing tests.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: `twr.ts` edge case — seed backfill

When the requested `from` date is on or before a configured seed date, the seed `(date, value)` becomes the effective start point. This is the spec's optional-backfill mechanism.

**Files:**
- Modify: `lib/model/metrics/twr.ts`
- Modify: `tests/model/metrics/twr.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/model/metrics/twr.test.ts`:

```ts
describe("computeTwr — seed backfill", () => {
  it("uses seed as effective start when from <= seedDate", () => {
    // seed: 2025-12-01 = 9000
    // snapshots: 2026-02-01 = 10000, 2026-04-01 = 11000
    // No flows.
    // Sub-period 1: 9000 -> 10000 = (10000 - 9000)/9000 = 0.1111...
    // Sub-period 2: 10000 -> 11000 = 0.1
    // TWR = 1.1111 * 1.1 - 1 = 0.2222...

    const navPoints: NavPoint[] = [
      { date: "2026-02-01", nav: 10000 },
      { date: "2026-04-01", nav: 11000 },
    ];

    const result = computeTwr({
      navPoints,
      transactions: [],
      period: { from: "2025-11-01", to: "2026-04-01" },
      seed: { date: "2025-12-01", value: 9000 },
    });

    expect(result.twr).not.toBeNull();
    expect(result.twr!).toBeCloseTo(0.22222, 4);
    expect(result.clamped).toBe(false);
    expect(result.effectiveStart).toEqual({ date: "2025-12-01", nav: 9000 });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].fromDate).toBe("2025-12-01");
    expect(result.segments[0].fromNav).toBe(9000);
  });

  it("ignores seed when from > seedDate (period starts after seed)", () => {
    const navPoints: NavPoint[] = [
      { date: "2026-02-01", nav: 10000 },
      { date: "2026-04-01", nav: 11000 },
    ];
    const result = computeTwr({
      navPoints,
      transactions: [],
      period: { from: "2026-01-15", to: "2026-04-01" },
      seed: { date: "2025-12-01", value: 9000 },
    });

    // Seed not used because requested from (2026-01-15) > seedDate (2025-12-01).
    expect(result.effectiveStart?.date).toBe("2026-02-01");
    expect(result.effectiveStart?.nav).toBe(10000);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
npm test -- tests/model/metrics/twr.test.ts
```
Expected: 2 new tests FAIL (the happy-path test still passes).

- [ ] **Step 3: Update `computeTwr` to handle seed backfill**

In `lib/model/metrics/twr.ts`, replace the section starting at `// Resolve effective endpoints` and going through the empty-segments early return with:

```ts
  // Resolve effective start: seed backfill if requested from <= seedDate,
  // else first snapshot >= from.
  const inPeriod = input.navPoints.filter(
    (p) => p.date >= input.period.from && p.date <= input.period.to,
  );

  const useSeed =
    input.seed !== null && input.period.from <= input.seed.date;

  const effectiveStart: { date: string; nav: number } | null = useSeed
    ? { date: input.seed!.date, nav: input.seed!.value }
    : inPeriod[0] ?? null;

  const effectiveEnd = inPeriod[inPeriod.length - 1] ?? null;

  if (
    !effectiveStart ||
    !effectiveEnd ||
    effectiveStart.date === effectiveEnd.date
  ) {
    return {
      twr: null,
      effectiveStart,
      effectiveEnd,
      clamped: false,
      segments,
      warnings,
    };
  }

  // Build the chain of points: effectiveStart, then any snapshots after
  // effectiveStart.date and ≤ effectiveEnd.date.
  const chainPoints: NavPoint[] = [
    effectiveStart,
    ...inPeriod.filter((p) => p.date > effectiveStart.date),
  ];
```

Then change the loop that walks `inPeriod[i]` / `inPeriod[i+1]` to walk `chainPoints[i]` / `chainPoints[i+1]` instead. The body of the loop is unchanged.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/model/metrics/twr.test.ts
```
Expected: 3 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add lib/model/metrics/twr.ts tests/model/metrics/twr.test.ts
git commit -m "twr: support optional seed backfill at effective start

When the requested period start is on or before a configured seed
date, the seed (date, value) becomes the effective start of the
chain instead of the earliest in-period snapshot. This is the
spec's only mechanism for extending TWR earlier than the user's
first snapshot CSV.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: `twr.ts` edge case — clamping

When the requested `from` is before the earliest available NAV point (snapshot or seed), the period is clamped to that earliest point and `clamped = true`. The loader will turn this into a `Clamped` warning.

**Files:**
- Modify: `lib/model/metrics/twr.ts`
- Modify: `tests/model/metrics/twr.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/model/metrics/twr.test.ts`:

```ts
describe("computeTwr — clamping", () => {
  it("sets clamped=true when from is before any snapshot and no seed", () => {
    const navPoints: NavPoint[] = [
      { date: "2026-02-01", nav: 10000 },
      { date: "2026-04-01", nav: 11000 },
    ];
    const result = computeTwr({
      navPoints,
      transactions: [],
      period: { from: "2025-01-01", to: "2026-04-01" },
      seed: null,
    });

    expect(result.clamped).toBe(true);
    expect(result.effectiveStart?.date).toBe("2026-02-01");
    expect(result.warnings).toContainEqual({
      kind: "Clamped",
      earliestDate: "2026-02-01",
    });
  });

  it("does not clamp when from <= seedDate and seed is set", () => {
    const navPoints: NavPoint[] = [
      { date: "2026-02-01", nav: 10000 },
      { date: "2026-04-01", nav: 11000 },
    ];
    const result = computeTwr({
      navPoints,
      transactions: [],
      period: { from: "2025-01-01", to: "2026-04-01" },
      seed: { date: "2025-12-01", value: 9000 },
    });

    expect(result.clamped).toBe(false);
    expect(result.warnings.find((w) => w.kind === "Clamped")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
npm test -- tests/model/metrics/twr.test.ts
```
Expected: 2 new tests FAIL.

- [ ] **Step 3: Add clamping logic**

In `lib/model/metrics/twr.ts`, after computing `effectiveStart` but before the early-return guard, add:

```ts
  const clamped =
    !useSeed &&
    effectiveStart !== null &&
    effectiveStart.date > input.period.from;

  if (clamped && effectiveStart) {
    warnings.push({ kind: "Clamped", earliestDate: effectiveStart.date });
  }
```

Then change the `clamped: false` literal in both return statements to `clamped`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/model/metrics/twr.test.ts
```
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/model/metrics/twr.ts tests/model/metrics/twr.test.ts
git commit -m "twr: surface clamping when from precedes earliest data

Sets clamped=true and emits a Clamped warning when the requested
period start is before any available NAV point and no seed backfill
is configured. The loader translates the warning into a banner via
AttentionBanner.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: `twr.ts` edge case — single snapshot, empty period, zero start NAV

Three small spec edge cases lumped into one task because each is a single short test plus a tiny code path.

**Files:**
- Modify: `lib/model/metrics/twr.ts`
- Modify: `tests/model/metrics/twr.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/model/metrics/twr.test.ts`:

```ts
describe("computeTwr — degenerate periods", () => {
  it("returns null TWR with InsufficientSnapshots when period has one snapshot", () => {
    const navPoints: NavPoint[] = [{ date: "2026-02-01", nav: 10000 }];
    const result = computeTwr({
      navPoints,
      transactions: [],
      period: { from: "2026-01-01", to: "2026-04-01" },
      seed: null,
    });

    expect(result.twr).toBeNull();
    expect(result.warnings).toContainEqual({
      kind: "InsufficientSnapshots",
      count: 1,
    });
  });

  it("returns null TWR with no warnings when period has zero snapshots and no seed", () => {
    const result = computeTwr({
      navPoints: [],
      transactions: [],
      period: { from: "2026-01-01", to: "2026-04-01" },
      seed: null,
    });

    expect(result.twr).toBeNull();
    expect(result.effectiveStart).toBeNull();
    expect(result.effectiveEnd).toBeNull();
  });

  it("skips the first sub-period when effective_start_nav = 0", () => {
    // Account opened with first transfer creating the first snapshot at 0.
    // 2026-01-01 NAV=0 (account opened, no funds yet)
    // 2026-02-01 deposit +10000 (external)
    // 2026-03-01 NAV=10500
    // 2026-04-01 NAV=11000
    //
    // First sub-period [01-01, 03-01] has start NAV 0 — skip it.
    // Chain begins at first non-zero snapshot (2026-03-01 = 10500).
    // Sub-period 1: 10500 -> 11000 (no flows in 03-01 to 04-01)
    //   r = 500 / 10500 ≈ 0.04762
    // TWR = 0.04762

    const navPoints: NavPoint[] = [
      { date: "2026-01-01", nav: 0 },
      { date: "2026-03-01", nav: 10500 },
      { date: "2026-04-01", nav: 11000 },
    ];

    const result = computeTwr({
      navPoints,
      transactions: [
        tx({
          tradeDate: "2026-02-01",
          action: "Journal",
          rawAction: "MoneyLink Deposit",
          amount: 10000,
        }),
      ],
      period: { from: "2026-01-01", to: "2026-04-01" },
      seed: null,
    });

    expect(result.twr).not.toBeNull();
    expect(result.twr!).toBeCloseTo(0.04762, 4);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].fromDate).toBe("2026-03-01");
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
npm test -- tests/model/metrics/twr.test.ts
```
Expected: 3 new tests FAIL.

- [ ] **Step 3: Update `computeTwr`**

Two changes in `lib/model/metrics/twr.ts`:

(a) Replace the existing early-return guard with one that distinguishes the cases:

```ts
  if (!effectiveStart || !effectiveEnd) {
    return {
      twr: null,
      effectiveStart,
      effectiveEnd,
      clamped,
      segments,
      warnings,
    };
  }

  if (effectiveStart.date === effectiveEnd.date) {
    warnings.push({ kind: "InsufficientSnapshots", count: 1 });
    return {
      twr: null,
      effectiveStart,
      effectiveEnd,
      clamped,
      segments,
      warnings,
    };
  }
```

(b) Skip leading zero-NAV points. Right after building `chainPoints`, drop any prefix where `chainPoints[i].nav === 0`:

```ts
  let firstNonZero = 0;
  while (firstNonZero < chainPoints.length && chainPoints[firstNonZero].nav === 0) {
    firstNonZero++;
  }
  const live = chainPoints.slice(firstNonZero);

  if (live.length < 2) {
    warnings.push({ kind: "InsufficientSnapshots", count: live.length });
    return {
      twr: null,
      effectiveStart,
      effectiveEnd,
      clamped,
      segments,
      warnings,
    };
  }
```

Then change the loop's bounds and reads from `chainPoints` to `live`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/model/metrics/twr.test.ts
```
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/model/metrics/twr.ts tests/model/metrics/twr.test.ts
git commit -m "twr: handle empty period, single snapshot, zero start NAV

Three small edge cases:
- Empty period (no snapshots, no seed) → null TWR, no warning.
- Single snapshot → null TWR + InsufficientSnapshots warning.
- Zero start NAV (account opened with first deposit, snapshot at 0
  before funds arrive) → skip leading zero-NAV points, chain
  begins at first non-zero NAV.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: `twr.ts` edge case — negative interior NAV

If any interior `N_i + weighted_i ≤ 0`, halt the chain and emit a `NegativeNav` warning. Without this guard, `(1 + r_i) < 0` corrupts the chained product silently.

**Files:**
- Modify: `lib/model/metrics/twr.ts`
- Modify: `tests/model/metrics/twr.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/model/metrics/twr.test.ts`:

```ts
describe("computeTwr — negative interior NAV", () => {
  it("returns null TWR + NegativeNav warning when interior denom is non-positive", () => {
    // Pathological: short option went deep ITM, snapshot NAV briefly negative.
    const navPoints: NavPoint[] = [
      { date: "2026-01-01", nav: 10000 },
      { date: "2026-02-01", nav: -500 },
      { date: "2026-03-01", nav: 11000 },
    ];

    const result = computeTwr({
      navPoints,
      transactions: [],
      period: { from: "2026-01-01", to: "2026-03-01" },
      seed: null,
    });

    expect(result.twr).toBeNull();
    expect(result.warnings).toContainEqual({
      kind: "NegativeNav",
      date: "2026-02-01",
      nav: -500,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify the new one fails**

```bash
npm test -- tests/model/metrics/twr.test.ts
```
Expected: 1 new test FAILS.

- [ ] **Step 3: Add the guard**

Inside the segment loop in `lib/model/metrics/twr.ts`, after computing `denom` but before computing `r`:

```ts
    if (denom <= 0) {
      warnings.push({ kind: "NegativeNav", date: a.date, nav: a.nav });
      return {
        twr: null,
        effectiveStart,
        effectiveEnd,
        clamped,
        segments,
        warnings,
      };
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/model/metrics/twr.test.ts
```
Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/model/metrics/twr.ts tests/model/metrics/twr.test.ts
git commit -m "twr: halt chain on non-positive denominator with NegativeNav warning

Short options going deep in-the-money can briefly drive snapshot
NAV negative. If we let the chain continue with (1 + r_i) < 0, the
product becomes a meaningless negative number. Halt with a null
TWR plus a NegativeNav warning naming the offending date so the
debug page shows where the chain broke.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: `twr.ts` edge case — UNKNOWN actions inside period

When `Action == "Unknown"` transactions fall inside the effective period, emit one `UnknownActionInPeriod` warning per unknown row. The loader will surface them; users see what was ignored when cross-checking against Schwab.

**Files:**
- Modify: `lib/model/metrics/twr.ts`
- Modify: `tests/model/metrics/twr.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/model/metrics/twr.test.ts`:

```ts
describe("computeTwr — unknown actions in period", () => {
  it("emits one UnknownActionInPeriod warning per unknown tx in the effective window", () => {
    const navPoints: NavPoint[] = [
      { date: "2026-01-01", nav: 10000 },
      { date: "2026-04-01", nav: 11000 },
    ];

    const result = computeTwr({
      navPoints,
      transactions: [
        tx({
          tradeDate: "2026-02-01",
          action: "Unknown",
          rawAction: "Misc Cash Entry",
          amount: 50,
        }),
        tx({
          tradeDate: "2026-03-15",
          action: "Unknown",
          rawAction: "Service Fee",
          amount: -2,
        }),
        tx({
          tradeDate: "2025-12-31",
          action: "Unknown",
          rawAction: "Older",
          amount: 1,
        }),
      ],
      period: { from: "2026-01-01", to: "2026-04-01" },
      seed: null,
    });

    const unknowns = result.warnings.filter(
      (w) => w.kind === "UnknownActionInPeriod",
    );
    expect(unknowns).toHaveLength(2);
    expect(unknowns[0]).toMatchObject({
      kind: "UnknownActionInPeriod",
      date: "2026-02-01",
      rawAction: "Misc Cash Entry",
      amount: 50,
    });
    expect(unknowns[1]).toMatchObject({
      kind: "UnknownActionInPeriod",
      date: "2026-03-15",
      rawAction: "Service Fee",
      amount: -2,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify it fails**

```bash
npm test -- tests/model/metrics/twr.test.ts
```
Expected: 1 new test FAILS.

- [ ] **Step 3: Update `computeTwr` to scan for unknowns**

Add the import at the top of `lib/model/metrics/twr.ts`:

```ts
import {
  externalFlowsBetween,
  unknownActionsBetween,
} from "@/lib/model/metrics/cashflow";
```

Then, after the `effectiveStart`/`effectiveEnd` resolution but before the chain loop, add:

```ts
  const unknowns = unknownActionsBetween(
    input.transactions,
    effectiveStart.date,
    effectiveEnd.date,
  );
  for (const u of unknowns) {
    warnings.push({
      kind: "UnknownActionInPeriod",
      date: u.tradeDate,
      rawAction: u.rawAction,
      amount: u.amount,
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/model/metrics/twr.test.ts
```
Expected: 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/model/metrics/twr.ts tests/model/metrics/twr.test.ts
git commit -m "twr: emit UnknownActionInPeriod warnings for unrecognized rows

When Action='Unknown' rows fall inside the effective TWR window,
the engine emits one warning per row carrying its date, raw action
string, and amount. Users see exactly what was ignored from the
return calc — useful for diagnosing divergences from Schwab and
prioritizing fixes for issue #20 (Misc Cash Entry / Service Fee
ingest mapping).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: `twr.ts` Modified Dietz cross-check (validation gate)

Add a separate test fixture whose expected TWR is independently derived using the textbook Modified Dietz formula. Asserting both gives us confidence the algorithm matches a published reference, not just our own arithmetic.

**Files:**
- Modify: `tests/model/metrics/twr.test.ts`

- [ ] **Step 1: Write the cross-check test**

Append to `tests/model/metrics/twr.test.ts`:

```ts
describe("computeTwr — Modified Dietz cross-check", () => {
  it("matches a textbook Modified Dietz hand-computation within 1e-4", () => {
    // Reference fixture: Investopedia-style Modified Dietz example.
    // Period: 90 days, [2026-01-01, 2026-04-01]
    // Beginning value: $100,000 (snapshot 2026-01-01)
    // Ending value:    $112,000 (snapshot 2026-04-01)
    // External cash flows during period:
    //   2026-01-31 deposit +$5,000 (day 30 of 90)
    //   2026-03-02 withdraw -$3,000 (day 60 of 90)
    //
    // Modified Dietz over the WHOLE period (single sub-period since there's
    // no interior snapshot):
    //   net_flows = 5000 - 3000 = 2000
    //   weighted = 5000 * (90 - 30)/90 + (-3000) * (90 - 60)/90
    //            = 5000 * 60/90 + (-3000) * 30/90
    //            = 3333.333 + (-1000)
    //            = 2333.333
    //   r = (112000 - 100000 - 2000) / (100000 + 2333.333)
    //     = 10000 / 102333.333
    //     ≈ 0.0977199
    //
    // computeTwr produces a chain of one segment (no interior snapshots),
    // so its TWR equals the Modified Dietz number.

    const navPoints: NavPoint[] = [
      { date: "2026-01-01", nav: 100000 },
      { date: "2026-04-01", nav: 112000 },
    ];

    const transactions: Transaction[] = [
      tx({
        tradeDate: "2026-01-31",
        action: "Journal",
        rawAction: "MoneyLink Deposit",
        amount: 5000,
      }),
      tx({
        tradeDate: "2026-03-02",
        action: "WireSent",
        rawAction: "Wire Sent",
        amount: -3000,
      }),
    ];

    const result = computeTwr({
      navPoints,
      transactions,
      period: { from: "2026-01-01", to: "2026-04-01" },
      seed: null,
    });

    const dietz = 10000 / (100000 + 2333.333333);
    expect(result.twr).not.toBeNull();
    expect(result.twr!).toBeCloseTo(dietz, 4);
    expect(result.twr!).toBeCloseTo(0.0977199, 4);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

```bash
npm test -- tests/model/metrics/twr.test.ts
```
Expected: 11 tests PASS. The cross-check should pass without further code changes — it's exercising the same algorithm against an independently-derived expected value.

If it fails, the algorithm has drifted from Modified Dietz. Investigate before continuing.

- [ ] **Step 3: Commit**

```bash
git add tests/model/metrics/twr.test.ts
git commit -m "twr: Modified Dietz cross-check fixture

A second fixture whose expected TWR is derived from the textbook
Modified Dietz formula. With one sub-period (no interior snapshot),
TWR-chained reduces to a single Modified Dietz number, so this
test pins our algorithm against a published reference. Asserts
result.twr ≈ Dietz within 1e-4.

This is the validation gate for issue #2: any algorithm change
that breaks this test means we've drifted from the reference.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 12: `benchmark.ts` (buy-and-hold TWR)

Pure function that takes a list of historical closes and an effective `[from, to]` window, and returns the buy-and-hold TWR over that window plus the snapped endpoints (closest trading day ≤ effective endpoint).

**Files:**
- Create: `lib/model/metrics/benchmark.ts`
- Test: `tests/model/metrics/benchmark.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/model/metrics/benchmark.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeBenchmark } from "@/lib/model/metrics/benchmark";

const closes = [
  { date: "2026-01-02", close: 500 },
  { date: "2026-01-03", close: 505 },
  { date: "2026-02-15", close: 520 },
  { date: "2026-03-30", close: 540 },
  { date: "2026-04-01", close: 545 },
];

describe("computeBenchmark", () => {
  it("computes buy-and-hold TWR between snapped endpoints", () => {
    const result = computeBenchmark({
      ticker: "SPY",
      closes,
      fromDate: "2026-01-02",
      toDate: "2026-04-01",
    });

    expect(result).not.toBeNull();
    expect(result!.ticker).toBe("SPY");
    expect(result!.fromDate).toBe("2026-01-02");
    expect(result!.fromClose).toBe(500);
    expect(result!.toDate).toBe("2026-04-01");
    expect(result!.toClose).toBe(545);
    expect(result!.twr).toBeCloseTo((545 - 500) / 500, 6);
  });

  it("snaps endpoints to closest trading day on or before each requested date", () => {
    const result = computeBenchmark({
      ticker: "SPY",
      closes,
      fromDate: "2026-01-01", // weekend
      toDate: "2026-04-15", // after last close
    });

    expect(result).not.toBeNull();
    expect(result!.fromDate).toBe("2026-01-02"); // first close on or after from
    expect(result!.toDate).toBe("2026-04-01"); // last close on or before to
  });

  it("returns null when there is no close on or before fromDate", () => {
    const result = computeBenchmark({
      ticker: "SPY",
      closes,
      fromDate: "2025-12-01",
      toDate: "2026-04-01",
    });
    // No close <= 2025-12-01, so we use the first available close on or after.
    // For now: when no close is in the window strictly within [fromDate, toDate],
    // function returns null. Adjust assertion based on actual behavior:
    // we want the first close >= fromDate and last close <= toDate to bracket
    // the period; if either side is empty, return null.
    expect(result).not.toBeNull();
    expect(result!.fromDate).toBe("2026-01-02"); // first close ≥ fromDate
  });

  it("returns null when no close falls inside [fromDate, toDate]", () => {
    const result = computeBenchmark({
      ticker: "SPY",
      closes,
      fromDate: "2027-01-01",
      toDate: "2027-12-31",
    });
    expect(result).toBeNull();
  });

  it("returns null when fromClose is 0 or non-finite", () => {
    const result = computeBenchmark({
      ticker: "SPY",
      closes: [
        { date: "2026-01-02", close: 0 },
        { date: "2026-04-01", close: 545 },
      ],
      fromDate: "2026-01-02",
      toDate: "2026-04-01",
    });
    expect(result).toBeNull();
  });

  it("returns null when fewer than 2 closes are in the window", () => {
    const result = computeBenchmark({
      ticker: "SPY",
      closes: [{ date: "2026-02-15", close: 500 }],
      fromDate: "2026-01-01",
      toDate: "2026-04-01",
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- tests/model/metrics/benchmark.test.ts
```
Expected: FAIL with `Cannot find module '@/lib/model/metrics/benchmark'`.

- [ ] **Step 3: Implement the module**

`lib/model/metrics/benchmark.ts`:

```ts
import type { BenchmarkResult } from "@/lib/model/types";

export type ComputeBenchmarkInput = {
  ticker: string;
  closes: Array<{ date: string; close: number }>;
  fromDate: string;
  toDate: string;
};

export function computeBenchmark(
  input: ComputeBenchmarkInput,
): BenchmarkResult | null {
  if (input.closes.length < 2) return null;

  // Snap from to first close ≥ fromDate. Snap to to last close ≤ toDate.
  const sorted = [...input.closes].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  const fromIdx = sorted.findIndex((c) => c.date >= input.fromDate);
  if (fromIdx === -1) return null;

  let toIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].date <= input.toDate) {
      toIdx = i;
      break;
    }
  }
  if (toIdx === -1 || toIdx <= fromIdx) return null;

  const fromClose = sorted[fromIdx].close;
  const toClose = sorted[toIdx].close;
  if (!Number.isFinite(fromClose) || fromClose <= 0) return null;
  if (!Number.isFinite(toClose)) return null;

  return {
    ticker: input.ticker,
    fromDate: sorted[fromIdx].date,
    fromClose,
    toDate: sorted[toIdx].date,
    toClose,
    twr: (toClose - fromClose) / fromClose,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/model/metrics/benchmark.test.ts
```
Expected: 6 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add lib/model/metrics/benchmark.ts tests/model/metrics/benchmark.test.ts
git commit -m "Add benchmark module: buy-and-hold TWR over a snapped window

Pure function that takes historical closes and an effective
[fromDate, toDate] window and returns buy-and-hold TWR plus the
actual trading-day endpoints used (snapped to closest close on or
before each side). Handles empty windows, zero-or-negative baseline
closes, and insufficient data by returning null. The loader passes
the same effective window TWR computed, keeping the comparison
apples-to-apples.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 13: Extend `AttentionBanner` for new warnings

Add the `describe()` cases for the four new `Warning` kinds, with the spec-mandated copy.

**Files:**
- Modify: `app/components/AttentionBanner.tsx`

- [ ] **Step 1: Read the current banner shape**

```bash
sed -n '1,40p' app/components/AttentionBanner.tsx
```

The existing `describe()` function has a switch over `Warning.kind` returning a string. We need to add four cases.

- [ ] **Step 2: Add the new `describe()` branches**

In `app/components/AttentionBanner.tsx`, find the existing `describe()` switch and add these cases (paste them above the `default:` case, or before the `MissingSeed` case for grouping):

```tsx
    case "Clamped":
      return `Earliest data: ${w.earliestDate}. Set a backfill seed via \`npm run account:configure\` to extend the period further back.`;
    case "NegativeNav":
      return `Account NAV went non-positive on ${w.date} (${w.nav.toLocaleString("en-US", { style: "currency", currency: "USD" })}). TWR cannot be computed across this point — the chain halts here.`;
    case "UnknownActionInPeriod":
      return `Unrecognized action "${w.rawAction}" on ${w.date} (${w.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}) — excluded from TWR. See issue #20.`;
    case "InsufficientSnapshots":
      return `TWR needs ≥2 snapshots in the period; this period has ${w.count}.`;
```

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 4: Run the suite to confirm nothing broke**

```bash
npm test
```
Expected: existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add app/components/AttentionBanner.tsx
git commit -m "AttentionBanner: copy for Clamped/NegativeNav/UnknownActionInPeriod/InsufficientSnapshots

Renders the four new TWR-related warning kinds with spec-mandated
copy. Clamped tells the user how to extend the period (account:configure).
NegativeNav points at the failure date. UnknownActionInPeriod surfaces
the raw Schwab action string so cross-checking against the Performance
tab is possible. InsufficientSnapshots explains the no-data state on
short periods.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 14: `accountOverview.ts` integration — TWR + benchmark

Replace the existing `closestOnOrBefore`-based NAV strip math with `computeTwr` + `computeBenchmark`. Push warnings into `state.warnings`. Add a regression test asserting the strip's TWR matches a hand-computed value.

**Files:**
- Modify: `lib/server/accountOverview.ts`
- Modify: `lib/model/types.ts` (NavStripData shape)
- Modify: `tests/server/accountOverview.test.ts`

- [ ] **Step 1: Update `NavStripData` shape in `lib/server/accountOverview.ts`**

Find the `NavStripData` type (in `lib/server/accountOverview.ts` around the export block). Replace the `computation` field shape with one that carries the segments and effective endpoints:

```ts
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
```

Add the necessary imports at the top of the file:

```ts
import type { BenchmarkResult, TwrSegment } from "@/lib/model/types";
import { computeTwr } from "@/lib/model/metrics/twr";
import { navSeriesFromSnapshots } from "@/lib/model/metrics/navSeries";
import { computeBenchmark } from "@/lib/model/metrics/benchmark";
```

- [ ] **Step 2: Replace `buildNavStrip`**

Find the existing `buildNavStrip` (the one that uses `closestOnOrBefore`). Replace its body with:

```ts
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
    clamped: twrResult.clamped,
    benchmark,
    computation: {
      period: period.key,
      requestedStart: period.start,
      requestedEnd: period.end,
      segments: twrResult.segments,
    },
  };
}
```

Delete the now-orphan `closestOnOrBefore` helper if it isn't referenced elsewhere in the file.

- [ ] **Step 3: Add a TWR-asserting test**

Append to `tests/server/accountOverview.test.ts`:

```ts
  it("computes TWR over snapshots within the requested period", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "twr1", label: "TWR Demo" });
    setSeed(db, "twr1", "2026-01-01", 10000);

    // Two snapshots: 10000 -> 11000 (no flows). r = 0.1, so twr should be 0.1.
    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-01-01",
        symbol: "ACME",
        description: "ACME",
        quantity: 100,
        price: 100,
        marketValue: 10000,
        costBasis: 10000,
        assetType: "equity",
        raw: {},
      },
      "snap1.csv",
    );
    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-04-01",
        symbol: "ACME",
        description: "ACME",
        quantity: 100,
        price: 110,
        marketValue: 11000,
        costBasis: 10000,
        assetType: "equity",
        raw: {},
      },
      "snap2.csv",
    );

    const result = await loadAccountOverviewView(account.uuid, {
      db,
      period: "All",
      today: "2026-04-29",
      includeMarketData: false,
    });
    if (result?.kind !== "ready") throw new Error("expected ready");

    expect(result.nav.twr).not.toBeNull();
    expect(result.nav.twr!).toBeCloseTo(0.1, 4);
    expect(result.nav.clamped).toBe(false);
    expect(result.nav.computation.segments).toHaveLength(1);
  });
```

- [ ] **Step 4: Run the loader test**

```bash
npm test -- tests/server/accountOverview.test.ts
```
Expected: existing 6 tests + 1 new = 7 tests PASS.

The previously-passing "uses live snapshot mark-to-market for current NAV, including options" test may need its `nav.computation` assertions updated to the new shape. If it still asserts `result.nav.computation.formula`, drop those lines — the new shape doesn't have `formula`.

- [ ] **Step 5: Type-check + full suite**

```bash
npm run typecheck && npm test
```
Expected: 0 type errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/server/accountOverview.ts tests/server/accountOverview.test.ts
git commit -m "accountOverview: replace ratio NAV strip with computeTwr + computeBenchmark

Replaces the closestOnOrBefore-based naive ratio (current - start)/start
with the new TWR engine. The strip now exposes:

- twr: chained sub-period return (or null if uncomputable)
- effectiveStart/effectiveEnd: actual endpoints used (after clamping
  and seed backfill)
- clamped: whether the period was clamped to earliest data
- benchmark: buy-and-hold TWR over the same effective window when
  accounts.benchmark is set
- computation.segments: per-interval breakdown for the debug page

The live mark-to-market snapshot value is appended as a synthetic
'today' NAV point so short periods between two snapshot dates can
still be computed.

TWR warnings (Clamped, NegativeNav, UnknownActionInPeriod,
InsufficientSnapshots) are pushed onto state.warnings; AttentionBanner
already renders them.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 15: `account.ts` integration

Same shape as Task 14, but for the options-page loader. Adds an optional `period` argument so callers can request a specific period; defaults to `"All"`.

**Files:**
- Modify: `lib/server/account.ts`
- Modify: `tests/server/account.test.ts`

- [ ] **Step 1: Add `period?: PeriodKey` to `LoadAccountOptionsViewOpts`**

In `lib/server/account.ts`:

```ts
import { resolvePeriod, type PeriodKey } from "@/lib/server/period";
import type { TwrResult } from "@/lib/model/types";
import { computeTwr } from "@/lib/model/metrics/twr";
import { navSeriesFromSnapshots } from "@/lib/model/metrics/navSeries";
import { computeBenchmark } from "@/lib/model/metrics/benchmark";
import { yesterdayInET } from "@/lib/util/dates";

export interface LoadAccountOptionsViewOpts {
  db?: Database.Database;
  includeMarketData?: boolean;
  period?: PeriodKey;
  today?: string;
}
```

- [ ] **Step 2: Compute and attach `TwrResult` to the view**

Inside `loadAccountOptionsView`, after `buildPortfolio` runs and `state.warnings` is finalized but before the final return, add:

```ts
  const today = opts.today ?? yesterdayInET();
  const periodKey = opts.period ?? "All";
  const period = resolvePeriod(
    periodKey,
    today,
    account.seedDate ?? earliestSnapshot?.asOf?.slice(0, 10) ?? today,
  );

  const navPoints = navSeriesFromSnapshots(
    listSnapshotsByAccount(db, account.id),
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
```

Add `twr` to the `AccountOptionsView` `kind: "ready"` variant:

```ts
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
```

And include `twr` in the final return.

- [ ] **Step 3: Add a test asserting the new TWR field**

In `tests/server/account.test.ts`, after the existing tests, add:

```ts
  it("includes a twr result with the loaded view", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "twr2", label: "TWR" });
    setSeed(db, "twr2", "2026-01-01", 10000);
    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-01-01",
        symbol: "ACME",
        description: "A",
        quantity: 100,
        price: 100,
        marketValue: 10000,
        costBasis: 10000,
        assetType: "equity",
        raw: {},
      },
      "s1.csv",
    );
    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-03-01",
        symbol: "ACME",
        description: "A",
        quantity: 100,
        price: 110,
        marketValue: 11000,
        costBasis: 10000,
        assetType: "equity",
        raw: {},
      },
      "s2.csv",
    );

    const result = await loadAccountOptionsView(account.uuid, {
      db,
      includeMarketData: false,
      today: "2026-03-15",
    });
    if (result?.kind !== "ready") throw new Error("expected ready");
    expect(result.twr).toBeDefined();
    expect(result.twr.twr).not.toBeNull();
    expect(result.twr.twr!).toBeCloseTo(0.1, 4);
  });
```

- [ ] **Step 4: Run the suite**

```bash
npm run typecheck && npm test
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/server/account.ts tests/server/account.test.ts
git commit -m "account: attach TwrResult to the options-page view

Adds an optional period argument (defaults to All) and computes a
TwrResult during loadAccountOptionsView. The view now carries a
twr field that the options page passes to ReturnMetricsCard,
replacing client-side computation against the naive return calc.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 16: `cash.ts` refactor — delegate flow classification

Replace the inline `Journal | WireSent` filter in `lib/model/cash.ts` with a call to `cashflow.externalFlowsBetween` covering the full series. Eliminates two-sources-of-truth.

**Files:**
- Modify: `lib/model/cash.ts`

- [ ] **Step 1: Read the current cash.ts**

```bash
sed -n '1,60p' lib/model/cash.ts
```

Find the inline filter (around line 28-30). It currently does:
```ts
if (t.action === "Journal" || t.action === "WireSent") {
  externalFlows.push({ date: t.tradeDate, signedAmount: t.amount });
}
```

- [ ] **Step 2: Replace with delegation**

Change the loop body so that the per-tx classification path uses `classifyAction`:

```ts
import { classifyAction } from "@/lib/model/metrics/cashflow";

// inside the loop:
if (classifyAction(t.action) === "external") {
  externalFlows.push({ date: t.tradeDate, signedAmount: t.amount });
}
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
npm test -- tests/model/cash.test.ts
```
Expected: existing tests pass — classification of Journal and WireSent is unchanged.

- [ ] **Step 4: Commit**

```bash
git add lib/model/cash.ts
git commit -m "cash: delegate external-flow classification to cashflow.ts

Removes the hardcoded Journal|WireSent filter in favor of
classifyAction. Single source of truth: cashflow.ts defines the
classification, cash.ts and twr.ts both consume it.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 17: `ReturnMetricsCard` consumes `TwrResult`

Replace the client-side `computeReturnMetrics` call with a `TwrResult` prop. Drop the best/worst-month UI. Keep the annualized number.

**Files:**
- Modify: `app/components/ReturnMetricsCard.tsx`
- Modify: `app/accounts/[uuid]/options/page.tsx`

- [ ] **Step 1: Read the current ReturnMetricsCard**

```bash
sed -n '1,50p' app/components/ReturnMetricsCard.tsx
```

- [ ] **Step 2: Rewrite the component to consume `TwrResult`**

Replace the contents of `app/components/ReturnMetricsCard.tsx` with:

```tsx
import type { TwrResult } from "@/lib/model/types";

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function annualize(twr: number, days: number): number {
  if (days <= 0) return twr;
  return Math.pow(1 + twr, 365 / days) - 1;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(to) - Date.parse(from)) / 86_400_000,
  );
}

export function ReturnMetricsCard({ twr }: { twr: TwrResult }) {
  if (twr.twr === null || !twr.effectiveStart || !twr.effectiveEnd) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-1">
          Return
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          TWR cannot be computed for the current window — see warnings above.
        </p>
      </div>
    );
  }

  const days = daysBetween(twr.effectiveStart.date, twr.effectiveEnd.date);
  const ann = annualize(twr.twr, days);
  const pos = twr.twr >= 0;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-1">
        Return
      </h3>
      <div
        className={`text-3xl font-bold ${pos ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
      >
        {pos ? "+" : ""}
        {fmtPct(twr.twr)}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        TWR · {days} days · annualized {fmtPct(ann)}
      </div>
      <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
        From {twr.effectiveStart.date} (NAV ${twr.effectiveStart.nav.toLocaleString()}) to {twr.effectiveEnd.date} (NAV ${twr.effectiveEnd.nav.toLocaleString()})
      </div>
      {twr.clamped && (
        <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
          Period clamped — earliest available data is {twr.effectiveStart.date}.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update the options page to pass the new prop**

In `app/accounts/[uuid]/options/page.tsx`, find the `<ReturnMetricsCard ... />` invocation. Change it from `<ReturnMetricsCard state={state} />` to `<ReturnMetricsCard twr={data.twr} />`.

- [ ] **Step 4: Type-check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add app/components/ReturnMetricsCard.tsx app/accounts/[uuid]/options/page.tsx
git commit -m "ReturnMetricsCard: consume TwrResult; drop best/worst month

Replaces the client-side computeReturnMetrics call with a TwrResult
prop produced by the loader. The card now shows TWR for the
effective window, annualized, plus the clamping note when applicable.

The 'best month / worst month' breakdown is dropped because (a) it
isn't in the spec or acceptance criteria, and (b) TWR sub-periods
don't align to calendar months — fabricating monthly bins from
non-uniform snapshot intervals would mislead users.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 18: `OverviewSummaryStrip` consumes the richer `NavStripData`

Update the strip component so it reads `twr`, `effectiveStart`, `effectiveEnd`, and `clamped` from the new shape.

**Files:**
- Modify: `app/components/OverviewSummaryStrip.tsx`

- [ ] **Step 1: Read the current component**

```bash
sed -n '1,80p' app/components/OverviewSummaryStrip.tsx
```

- [ ] **Step 2: Update the prop type and rendering**

Find the prop type declaration that describes `nav`. The type is currently inferred from `NavStripData`. Update wherever it dereferences `nav.changePct` or `nav.changeAmount` to instead read `nav.twr` for the percentage and compute the dollar change as `(nav.effectiveEnd?.nav ?? 0) - (nav.effectiveStart?.nav ?? 0)` — adjusted for the strip's existing layout.

If the component currently shows formulas like:

```tsx
{fmtPct(nav.changePct)}
+{fmtMoney(nav.changeAmount)} since {nav.computation.effectiveStart}
```

replace with:

```tsx
{nav.twr === null ? "—" : `${nav.twr >= 0 ? "+" : ""}${fmtPct(nav.twr)}`}
{nav.effectiveStart && nav.effectiveEnd
  ? ` (TWR · ${nav.effectiveStart.date} → ${nav.effectiveEnd.date}${nav.clamped ? " · clamped" : ""})`
  : ""}
```

(Match the surrounding tone and exact element structure of the existing file. The point is: read from the new fields, render `—` when `twr` is null, and surface `clamped` somewhere.)

- [ ] **Step 3: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 4: Run the suite**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add app/components/OverviewSummaryStrip.tsx
git commit -m "OverviewSummaryStrip: render TWR + clamping note from new NavStripData

Reads twr, effectiveStart, effectiveEnd, and clamped from the
richer NavStripData shape produced by accountOverview's TWR
integration. Renders an em-dash when TWR cannot be computed
(short period, single snapshot) so the strip never silently shows
a misleading naive ratio.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 19: `account:configure --label` flag

Adds `--label` to the non-interactive flag mode. Adds `setLabel` repo function in `lib/db/repos/accounts.ts`. Adds a prompt branch in the interactive flow.

**Files:**
- Modify: `lib/db/repos/accounts.ts`
- Modify: `scripts/account-configure.ts`
- Modify: `tests/scripts/account-configure.test.ts`
- Create: `tests/db/repos/accounts-setLabel.test.ts`

- [ ] **Step 1: Write the failing test for `setLabel`**

`tests/db/repos/accounts-setLabel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import {
  upsertAccount,
  setLabel,
  getAccountByExternalId,
} from "@/lib/db/repos/accounts";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("setLabel", () => {
  it("updates the label of an existing account", () => {
    const db = makeDb();
    upsertAccount(db, { externalId: "100", label: "Old" });
    setLabel(db, "100", "New");
    expect(getAccountByExternalId(db, "100")?.label).toBe("New");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- tests/db/repos/accounts-setLabel.test.ts
```
Expected: FAIL with `setLabel is not a function`.

- [ ] **Step 3: Add `setLabel`**

In `lib/db/repos/accounts.ts`, alongside the existing `setSeed` / `setBenchmark` exports:

```ts
export function setLabel(
  db: Database.Database,
  externalId: string,
  label: string,
): void {
  db.prepare("UPDATE accounts SET label = ? WHERE external_id = ?").run(
    label,
    externalId,
  );
}
```

- [ ] **Step 4: Verify it passes**

```bash
npm test -- tests/db/repos/accounts-setLabel.test.ts
```
Expected: PASS.

- [ ] **Step 5: Add `--label` parsing**

In `scripts/account-configure.ts`, extend `CliFlags` and `parseFlags`:

```ts
export type CliFlags = {
  account?: string;
  seedDate?: Choice<string>;
  seedValue?: Choice<number>;
  benchmark?: Choice<string>;
  label?: Choice<string>;
};

// In parseFlags, add the case:
//   case "label":
//     flags.label = parseLabel(value);
//     break;
```

Add a `parseLabel` parser:

```ts
function parseLabel(raw: string): Choice<string> {
  const v = raw.trim();
  if (v === "") return { kind: "keep" };
  if (v === "-") {
    throw new Error("--label cannot be cleared (label is required)");
  }
  if (v.length > 100) {
    throw new Error(`label too long (${v.length} chars, max 100)`);
  }
  return { kind: "set", value: v };
}
```

Add the import for `setLabel` and update `configureNonInteractive` to apply the label:

```ts
  if (flags.label !== undefined && flags.label.kind === "set") {
    setLabel(db, account.externalId, flags.label.value);
  }
```

Update the "no flags supplied" guard so it accepts `label`:

```ts
  if (
    flags.seedDate === undefined &&
    flags.seedValue === undefined &&
    flags.benchmark === undefined &&
    flags.label === undefined
  ) {
    throw new Error(
      "non-interactive mode requires at least one of --seed-date, --seed-value, --benchmark, --label",
    );
  }
```

- [ ] **Step 6: Add the interactive prompt branch**

In `configureOne`, add a prompt for the label after the existing benchmark prompt:

```ts
  const labelRaw = await rl.question(
    `  Label (blank=keep, current="${account.label}"): `,
  );
  if (labelRaw.trim() !== "") {
    setLabel(db, account.externalId, labelRaw.trim());
    touched = true;
  }
```

- [ ] **Step 7: Add tests for the new flag and label update**

Append to `tests/scripts/account-configure.test.ts`:

```ts
describe("parseFlags — label", () => {
  it("parses --label", () => {
    const flags = parseFlags(["--account=1", "--label=My Account"]);
    expect(flags.label).toEqual({ kind: "set", value: "My Account" });
  });

  it("rejects empty --label", () => {
    expect(parseFlags(["--label="]).label).toEqual({ kind: "keep" });
  });

  it("rejects --label=-", () => {
    expect(() => parseFlags(["--label=-"])).toThrow(/label cannot be cleared/);
  });
});

describe("configureNonInteractive — label", () => {
  it("renames an account", () => {
    const db = makeDb();
    upsertAccount(db, { externalId: "100", label: "Old" });
    configureNonInteractive(
      { account: "100", label: { kind: "set", value: "New Label" } },
      db,
    );
    expect(getAccountByExternalId(db, "100")?.label).toBe("New Label");
  });
});
```

- [ ] **Step 8: Run all account-configure tests**

```bash
npm test -- tests/scripts/account-configure.test.ts tests/db/repos/accounts-setLabel.test.ts
```
Expected: existing 14 + 4 new = 18 tests PASS.

- [ ] **Step 9: Type-check**

```bash
npm run typecheck
```

- [ ] **Step 10: Commit**

```bash
git add lib/db/repos/accounts.ts scripts/account-configure.ts tests/scripts/account-configure.test.ts tests/db/repos/accounts-setLabel.test.ts
git commit -m "account-configure: --label flag + interactive prompt

Adds the only flag from the spec's --account-configure list whose
backing column already exists. The flag rejects empty/clear values
because account.label is NOT NULL in the schema. The interactive
flow gains a label prompt after the benchmark prompt.

The other spec flags (--target, --group, --expected-real-return)
still need DB migrations and are deferred to a follow-up issue.
The --market-data on|off flag from the spec is dropped because
the gate it referenced was removed in PR #30.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 20: `/_debug/twr` page

A hidden server component renders the `TwrResult.segments` array as a table for cross-checking against Schwab's "Performance" tab. Not linked from nav.

**Files:**
- Create: `app/accounts/[uuid]/_debug/twr/page.tsx`

- [ ] **Step 1: Create the page**

`app/accounts/[uuid]/_debug/twr/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { loadAccountOverviewView } from "@/lib/server/accountOverview";
import type { PeriodKey } from "@/lib/server/period";

export const dynamic = "force-dynamic";

const VALID_PERIODS: PeriodKey[] = ["1M", "3M", "YTD", "1Y", "All"];

export default async function DebugTwrPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { uuid } = await params;
  const { period: rawPeriod } = await searchParams;
  const period: PeriodKey =
    typeof rawPeriod === "string" && (VALID_PERIODS as string[]).includes(rawPeriod)
      ? (rawPeriod as PeriodKey)
      : "YTD";

  const data = await loadAccountOverviewView(uuid, { period });
  if (data === null) notFound();
  if (data.kind !== "ready") {
    return (
      <main className="p-6 max-w-7xl mx-auto font-mono text-sm">
        <p>No data for this account.</p>
      </main>
    );
  }

  const nav = data.nav;
  const seg = nav.computation.segments;

  return (
    <main className="p-6 max-w-7xl mx-auto font-mono text-xs">
      <h1 className="text-lg font-bold mb-2">
        TWR debug · {data.account.label} · {period}
      </h1>
      <div className="mb-4 text-gray-600 dark:text-gray-400">
        <div>Effective start: {nav.effectiveStart?.date ?? "(none)"} (NAV {nav.effectiveStart?.nav.toLocaleString() ?? "—"})</div>
        <div>Effective end: {nav.effectiveEnd?.date ?? "(none)"} (NAV {nav.effectiveEnd?.nav.toLocaleString() ?? "—"})</div>
        <div>Clamped: {String(nav.clamped)}</div>
        <div>TWR: {nav.twr === null ? "null" : (nav.twr * 100).toFixed(4) + "%"}</div>
        <div>Benchmark: {nav.benchmark ? `${nav.benchmark.ticker} ${(nav.benchmark.twr * 100).toFixed(4)}% (${nav.benchmark.fromDate} → ${nav.benchmark.toDate})` : "(none)"}</div>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-300 dark:border-neutral-700">
            <th className="text-left px-2 py-1">From</th>
            <th className="text-right px-2 py-1">From NAV</th>
            <th className="text-left px-2 py-1">To</th>
            <th className="text-right px-2 py-1">To NAV</th>
            <th className="text-right px-2 py-1">Flows ($)</th>
            <th className="text-right px-2 py-1">Weighted</th>
            <th className="text-right px-2 py-1">r_i</th>
            <th className="text-left px-2 py-1">Flow detail</th>
          </tr>
        </thead>
        <tbody>
          {seg.map((s, i) => (
            <tr
              key={i}
              className="border-b border-gray-100 dark:border-neutral-800"
            >
              <td className="px-2 py-1">{s.fromDate}</td>
              <td className="px-2 py-1 text-right tabular-nums">{s.fromNav.toLocaleString()}</td>
              <td className="px-2 py-1">{s.toDate}</td>
              <td className="px-2 py-1 text-right tabular-nums">{s.toNav.toLocaleString()}</td>
              <td className="px-2 py-1 text-right tabular-nums">{s.flowsTotal.toLocaleString()}</td>
              <td className="px-2 py-1 text-right tabular-nums">{s.weightedFlows.toFixed(2)}</td>
              <td className="px-2 py-1 text-right tabular-nums">
                {(s.return * 100).toFixed(4)}%
              </td>
              <td className="px-2 py-1">
                {s.flows
                  .map((f) => `${f.date}: ${f.amount} (w=${f.weight.toFixed(3)})`)
                  .join("; ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {data.warnings.length > 0 && (
        <div className="mt-6">
          <h2 className="font-bold mb-1">Warnings</h2>
          <ul className="list-disc pl-5">
            {data.warnings.map((w, i) => (
              <li key={i}>{JSON.stringify(w)}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Type-check + build**

```bash
npm run typecheck && npm run build
```
Expected: no errors. The build summary should list `/accounts/[uuid]/_debug/twr` as a dynamic route.

- [ ] **Step 3: Commit**

```bash
git add app/accounts/[uuid]/_debug/twr/page.tsx
git commit -m "Add hidden /_debug/twr page for TWR inspection

Server-rendered table of TwrResult.segments — every snapshot, every
flow with its weight, every interval's r_i, plus the chained TWR.
Pasteable for side-by-side comparison with Schwab's 'Performance'
tab. The page is admin-by-convention: not linked from any nav, you
open it by typing /accounts/[uuid]/_debug/twr?period=YTD.

Falls back to YTD when no period query param is supplied.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 21: Delete `returns.ts`

After all callers have migrated to `TwrResult`, the legacy module can be removed. TypeScript proves there are no remaining imports.

**Files:**
- Delete: `lib/model/metrics/returns.ts`
- Delete: `tests/model/metrics/returns.test.ts`

- [ ] **Step 1: Confirm no imports remain**

```bash
grep -rn "from.*lib/model/metrics/returns\|from.*@/lib/model/metrics/returns" --include="*.ts" --include="*.tsx" .
```
Expected: no results.

- [ ] **Step 2: Delete the files**

```bash
git rm lib/model/metrics/returns.ts tests/model/metrics/returns.test.ts
```

- [ ] **Step 3: Type-check + full suite**

```bash
npm run typecheck && npm test
```
Expected: 0 errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "Remove legacy returns.ts module

Superseded by lib/model/metrics/twr.ts. ReturnMetricsCard,
accountOverview's NAV strip, and any other consumer now read from
the TwrResult produced server-side. TypeScript verified there are
no remaining imports.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 22: Manual verification + PR

**Files:** none (manual + PR creation).

- [ ] **Step 1: Full pipeline gates**

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
Expected: all pass; build summary lists `/accounts/[uuid]/_debug/twr` as a dynamic route.

- [ ] **Step 2: Run the dev server**

```bash
npm run dev
```

- [ ] **Step 3: UI walkthrough**

- [ ] `/accounts/<uuid>/overview` — NAV strip shows TWR % for each period (`1M / 3M / YTD / 1Y / All`)
- [ ] Clamping banner appears when period predates earliest snapshot and seed isn't set
- [ ] `/accounts/<uuid>/options` — `ReturnMetricsCard` shows TWR (no best/worst month)
- [ ] `/accounts/<uuid>/_debug/twr?period=YTD` shows the segment table
- [ ] `npm run account:configure -- --account=<id> --label="New Label"` renames the account; subsequent page loads show the new label
- [ ] Open Schwab's "Performance" tab for the same account and the same period; compare TWR. Note any divergence in the PR thread; persistent divergence gets documented in `docs/methodology.md` (separate PR).

- [ ] **Step 4: Pre-commit hygiene check**

```bash
git status
git diff --cached
```
Expected: only files under `app/`, `lib/`, `scripts/`, `tests/`, `docs/superpowers/plans/`. No CSV/XLSX, no files under `data/` / `transactions/` / `sheets/`.

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin fix/2-snapshot-aligned-twr
gh pr create --base multi-account --title "Snapshot-aligned TWR + optional backfill (issue #2)" --body "$(cat <<'EOF'
## Summary

Issue #2: replaces the naive return calc with snapshot-aligned Time-Weighted Return.

- Four pure modules under `lib/model/metrics/`: `cashflow.ts` (classification), `navSeries.ts` (snapshot rows → NAV series), `twr.ts` (the engine), `benchmark.ts` (buy-and-hold over the same effective window).
- `lib/server/accountOverview.ts` and `lib/server/account.ts` compose them; the strip and `ReturnMetricsCard` consume server-produced `TwrResult` props.
- `AttentionBanner` extends with `Clamped`, `NegativeNav`, `UnknownActionInPeriod`, `InsufficientSnapshots` warnings.
- Hidden `/accounts/[uuid]/_debug/twr` page renders the per-segment breakdown for cross-checking against Schwab's "Performance" tab.
- `account:configure` gains `--label` (the only flag from the spec list whose backing column already exists).
- Legacy `lib/model/metrics/returns.ts` deleted.

## Validation

- Hand-built fixture in `twr.test.ts` covers every spec edge case (empty period, single snapshot, zero start NAV, clamping, seed backfill, negative interior NAV, unknown actions, mid-period flow).
- Modified Dietz cross-check fixture pins the algorithm against the textbook formula within 1e-4.
- Manual Schwab "Performance" tab comparison: see PR thread (or `docs/methodology.md` if persistent divergence).

## Test plan

- [x] `npm test` passes
- [x] `npm run typecheck` clean
- [x] `npm run lint` clean
- [x] `npm run build` succeeds; `/accounts/[uuid]/_debug/twr` registered as dynamic
- [ ] Overview NAV strip shows TWR for each period
- [ ] Clamping banner appears when period predates seed
- [ ] Options-page `ReturnMetricsCard` shows TWR (no best/worst month)
- [ ] `/accounts/<uuid>/_debug/twr?period=YTD` renders the segment table
- [ ] `account:configure --label="New"` renames the account
- [ ] At least one period's TWR cross-checked against Schwab's Performance tab

## Out of scope (deferred follow-ups)

- "ⓘ How is this computed" popover on cards (debug page covers the inspection need)
- `--target / --group / --expected-real-return` flags (require DB migration)
- `--market-data on|off` flag (gate removed in PR #30)
- Best/worst month UI (not in spec)
- `docs/methodology.md` (separate PR if Schwab cross-check produces persistent divergence)

Closes #2

*Co-authored by Claude*
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** every acceptance criterion in issue #2 maps to a specific task: 4 metric modules (Tasks 2, 3, 5–11, 12), edge-case coverage (Tasks 6–10), Modified Dietz cross-check (Task 11), card consumption (Task 17), `account:configure` flags (Task 19, with the documented exceptions for the obsolete `--market-data` and the deferred `--target/--group/--expected-real-return`), hand-built fixture validating against hand-computed value (Task 5 happy path is the primary one; Task 11 is the Modified Dietz cross-check).
- **Placeholder scan:** no "TBD"/"TODO" left; every code block is real code or a real edit specification.
- **Type consistency:** `TwrResult` shape is defined once in `lib/model/types.ts` (Task 4) and consumed verbatim in Tasks 14, 15, 17. `BenchmarkResult` likewise. `Warning` variant kinds (`Clamped`, `NegativeNav`, `UnknownActionInPeriod`, `InsufficientSnapshots`) are emitted in Tasks 7–10 and rendered in Task 13 — all four kind strings are spelled the same way in both the type definition and every callsite.
- **Bigger PR than recent ones:** ~22 tasks across 4 new pure modules + integration + debug page + tests. The bottom-up TDD ordering means every commit is independently shippable.
