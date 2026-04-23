# Historical Portfolio Value Line — Design

**Date:** 2026-04-23
**Status:** Draft — awaiting review
**Issue:** [#9](https://github.com/jayrav13/schwab-lens/issues/9)
**Follow-ons:** [#11](https://github.com/jayrav13/schwab-lens/issues/11) (interactivity), [#12](https://github.com/jayrav13/schwab-lens/issues/12) (SPY benchmark)

## Problem

NavCard currently renders a single line: `state.navSeries`, which is `cash_at_date + Σ(shares × avg_cost)` at each trade date. That line is useful for "what am I up on premium collected" but ignores market moves on held shares — if ACME's share price doubles between a buy and the next trade, the line doesn't reflect it.

Mark-to-market (#7) added a *current-value* KPI in the MarkToMarket card. The follow-on (#9) is to extend that into a full time-series line on NavCard so the user can compare Options Income vs. real Portfolio Value over the account's lifetime.

## Goals

- Render Portfolio Value as a second line on NavCard, one point per trading day from seed date through yesterday (T-1).
- Use cached historical daily closes to minimize yahoo-finance2 load across reloads.
- Degrade gracefully when any one ticker's history can't be fetched: the line still renders using the tickers we do have, and the shortfall is surfaced as a user-visible warning.
- Gate the feature under the existing `config.marketData.enabled` flag, matching the current-quotes path.

## Non-goals (this feature)

- Interactivity (hover tooltip, range selector, legend toggle) — deferred to #11.
- Benchmark overlays (SPY, QQQ) — deferred to #12.
- Splicing in today's live quote as the last point — historical-only endpoint (yesterday's close); MarkToMarket already shows live current value.
- Dividend / split adjustments on the historical closes — yahoo-finance2 provides `adjClose`; we consume `close` for simplicity, revisit if there's material drift.
- Retries, exponential backoff, rate limiting — yahoo-finance2 behaves well enough that we don't speculate.

## Design summary

- **New module** `lib/market/historical.ts`: per-ticker fetch + append-only JSON cache at `.cache/market/historical/<TICKER>.json`.
- **New derivation** `lib/model/metrics/portfolio_value.ts`: pure function over `PortfolioState` + `{ticker → {date → close}}` → `{ series: NavPoint[], missingTickers: string[] }`.
- **Dashboard wiring** in `lib/server/dashboard.ts`: after `buildPortfolio`, if `marketData.enabled`, load historical caches for every ticker ever held, fetch gaps, compute the series, attach to state.
- **NavCard** renders both lines with a new legend row; if `portfolioValueSeries` is absent or has `< 2` points, falls back to the single-line view that exists today.
- **New warning variant** `MissingHistoricalPrices` surfaced through the existing `AttentionBanner`.

## Architecture

```
 data/ (CSVs)                .cache/market/historical/<TICKER>.json
      │                                   │
      ▼                                   │
lib/server/dashboard.ts ─────────────────►│
      │          loads cache per ticker
      │          fetches gaps via yahoo-finance2 `historical()`
      │          writes updated cache back
      ▼
 lib/model/metrics/portfolio_value.ts  (pure)
      │
      ▼
 state.portfolioValueSeries + warnings (MissingHistoricalPrices)
      │
      ▼
 app/components/NavCard.tsx  (two polylines + legend)
 app/components/AttentionBanner.tsx  (new warning branch)
```

All I/O (fetch + cache read/write) lives in `lib/market/historical.ts` and is invoked from the server layer. The derivation is pure and testable without mocks.

## Module contracts

### `lib/market/historical.ts`

```ts
export type HistoricalClose = { date: string; close: number };

export type HistoricalFetchResult =
  | { kind: "ok"; closes: HistoricalClose[] }
  | { kind: "error"; ticker: string; message: string };

// Returns closes for every trading day yahoo reports in [fromDate, toDate].
// Handles cache read, gap detection, fetch, cache write atomically.
export async function loadHistoricalCloses(
  ticker: string,
  fromDate: string, // YYYY-MM-DD, inclusive
  toDate: string,   // YYYY-MM-DD, inclusive (= "yesterday" in ET)
  cacheDir: string, // defaults to .cache/market/historical
): Promise<HistoricalFetchResult>;
```

**Cache file shape** (`.cache/market/historical/ACME.json`):

```json
{
  "2026-01-05": 50.12,
  "2026-01-06": 49.88,
  "2026-01-07": 51.00
}
```

Flat date→close map. Append-only: any date strictly before today is immutable, so cache hits never need invalidation. Cache misses are fetched via `yahoo-finance2 historical({ period1, period2, interval: "1d" })` and merged in.

### `lib/model/metrics/portfolio_value.ts`

```ts
export function computePortfolioValueSeries(
  state: PortfolioState,
  historicalCloses: Record<string, Record<string, number>>, // ticker → date → close
  endDate: string, // YYYY-MM-DD, inclusive — "yesterday" in ET
): {
  series: NavPoint[];
  missingTickers: string[];
};
```

Pure function. Walks `state.transactions` forward from `seed.asOf`, folding Buy/Sell into a `Map<ticker, shares>`. For each trading day in `historicalCloses` (union of all tickers' known dates, bounded by `[seed.asOf, endDate]`), computes:

```
portfolioValue(date) = cash(date) + Σ shares_held(ticker, date) × close(ticker, date)
```

`cash(date)` comes from the existing `state.cashLedger`, forward-filled across non-trade days. Any ticker in `shares_held` with no entry in `historicalCloses[ticker][date]` is skipped for that date's sum and the ticker is added to `missingTickers`.

## Data flow

1. `loadDashboard` computes `state` via `buildPortfolio` as today.
2. If `config.marketData.enabled === false`: `portfolioValueSeries` is `undefined`, NavCard single-line fallback.
3. Otherwise: gather the set of tickers ever held in `state.transactions` (union of `Buy`/`Sell` tickers plus `seed.initialShares`). Compute `endDate = yesterday-in-ET`. For each ticker, `loadHistoricalCloses(ticker, seed.asOf, endDate)`.
4. Build the nested `historicalCloses` map from successful results. Failed tickers form the initial `missingTickers` list.
5. `computePortfolioValueSeries(state, historicalCloses, endDate)` returns `series` + any additional `missingTickers` (tickers held on dates but missing data for that date).
6. Attach `portfolioValueSeries` to the returned `DashboardData`; push one `MissingHistoricalPrices` warning per distinct missing ticker into `state.warnings`.

## Rendering (NavCard)

Additive changes to `app/components/NavCard.tsx`:

- Recompute Y range to include both series' values: `min/max` over `seedValue ∪ navSeries ∪ portfolioValueSeries`.
- Recompute X range to the later of the two series' last dates.
- Plot the Portfolio Value polyline in violet (`#8b5cf6`) with the same scale transforms as the Options Income line.
- New legend row (small colored swatches + labels) above the chart body.
- Guard: if `state.portfolioValueSeries === undefined || portfolioValueSeries.length < 2`, skip the second line and legend — identical rendering to today.

No tooltip, scrubber, or interactive layer — that's #11.

## Error handling

| Condition                                           | Behavior                                                                    |
|-----------------------------------------------------|-----------------------------------------------------------------------------|
| `config.marketData.enabled === false`               | Skip entirely. `portfolioValueSeries` is `undefined`.                       |
| Cache file missing                                  | Treat as empty map. Fetch full range.                                       |
| Cache file malformed JSON                           | Log, treat as empty, refetch. Don't crash.                                  |
| yahoo-finance2 throws for one ticker                | Ticker added to `missingTickers`. Derivation proceeds without it.           |
| All tickers fail                                    | Series has only the cash component. If series has `< 2` points, UI hides it.|
| `historical()` returns empty for a valid range      | Treat same as failure.                                                      |
| Cache write fails mid-update                        | Atomic: write to `<ticker>.json.tmp`, `rename()` in place. Partial writes impossible. |

Warnings are deduplicated in `loadDashboard` — one `MissingHistoricalPrices` per ticker, not per date.

## Edge cases

- **Fully new account** (`navSeries.length < 2`): existing NavCard guard still applies; second line also skipped.
- **Seed cash only, no shares ever**: Portfolio Value = cash forward-filled. Overlaps Options Income by construction. Both lines render on top of each other — acceptable, no special handling.
- **User cleared `.cache/market/historical/`**: first load refetches everything (slower). Subsequent loads fast.
- **Seed date is today or later**: `endDate < seed.asOf`. Empty range → empty series → single-line fallback.
- **Timezone**: all dates compared as `YYYY-MM-DD` strings in ET. "Yesterday" = `(Date.now() - 24h)` formatted as an ET calendar date. Single helper in `lib/util/dates.ts` (existing module).

## Testing

- **`tests/market/historical.test.ts`** (new)
  - Fresh cache fetches full range
  - Partial cache fetches only missing tail
  - Malformed cache falls back to empty, doesn't throw
  - yahoo-finance2 throw → `{ kind: "error" }`, cache file unchanged
  - Cache write is atomic (`.tmp` → `rename`)
  - Network mocked (same pattern as `tests/market/quotes.test.ts`)

- **`tests/model/metrics/portfolio_value.test.ts`** (new)
  - Pure, no I/O, fixture-only
  - Shares-at-date correct across Buy/Sell
  - Cash forward-fills across non-trade days
  - Missing ticker excluded per-date, ticker surfaced in `missingTickers`
  - Empty shares history → series equals cash-only forward-fill

- **`tests/integration.test.ts`** (extend existing)
  - `loadDashboard` result: `portfolioValueSeries` populated when `marketData.enabled` and snapshots/transactions present; absent otherwise

- **Manual smoke** in dev:
  - Real data in `data/` + populated `.cache/market/historical/`
  - Verify Y range accommodates both lines; Options Income line position unchanged
  - Delete `.cache/market/historical/` and reload — still renders (slower)
  - Toggle `marketData.enabled: false` in `data/config.json` — falls back to single line cleanly

## Open questions

None — all design choices resolved in brainstorming.

## Files

**New:**
- `lib/market/historical.ts`
- `lib/model/metrics/portfolio_value.ts`
- `tests/market/historical.test.ts`
- `tests/model/metrics/portfolio_value.test.ts`

**Modified:**
- `lib/model/types.ts` — add `portfolioValueSeries?: NavPoint[]` to `PortfolioState`; add `MissingHistoricalPrices` warning variant
- `lib/server/dashboard.ts` — gather tickers, call loader, compute series, attach + warnings
- `app/components/NavCard.tsx` — second polyline + legend row + guard
- `app/components/AttentionBanner.tsx` — render branch for `MissingHistoricalPrices`
- `tests/integration.test.ts` — extend the existing dashboard assertion
- `.gitignore` — already ignores `/.cache/` at line 59 (confirmed), no change needed
