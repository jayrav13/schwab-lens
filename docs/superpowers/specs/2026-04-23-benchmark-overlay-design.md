# NavCard Benchmark Overlay — Design

**Date:** 2026-04-23
**Status:** Draft — awaiting review
**Issue:** [#12](https://github.com/jayrav13/schwab-lens/issues/12)
**Depends on:** #9 (historical close cache, shipped)

## Problem

NavCard now shows Options Income (cash + shares at cost) and Portfolio Value (cash + shares at market). Both lines are *absolute* — they answer "how much have I made" but not "how did that compare to just buying an index fund." A SPY overlay, drawn on the same Y axis normalized to seed capital, makes it trivial to see whether the wheel strategy actually beat a passive benchmark.

## Goals

- Render a third line on NavCard: the configured benchmark (default SPY), normalized so it starts at `seedValue` on the seed date and grows by the index's cumulative return.
- Opt-in via a single config field. Default is off, so zero-config behavior is unchanged.
- Reuse the existing historical cache (`.cache/market/historical/<TICKER>.json`) from #9. No new cache shape, no new fetch module.
- Degrade gracefully: if the benchmark's historical data can't be fetched, surface a `MissingHistoricalPrices` warning and render the other two lines unchanged.

## Non-goals (this feature)

- A picker UI to switch benchmarks from the dashboard. Edit `data/config.json` to change.
- Supporting multiple benchmarks simultaneously (e.g. SPY *and* QQQ).
- Dividend-adjusted total return. Raw close-to-close. Over the time horizons a personal wheel dashboard shows (months to a couple years), the SPY dividend yield is small enough to ignore; we can revisit if it becomes noticeable.
- Beta / alpha / tracking-error stats. That's a separate analysis card, not a chart concern.

## Design summary

- **Config gains `benchmark?: string | null`.** `"SPY"` → overlay on. `null` / `undefined` → off. No default ticker — opt-in is explicit.
- **`loadDashboard` fetches the benchmark's history** using the existing `loadHistoricalCloses`, for the same `[seed.asOf, endDate]` range as the held-ticker pass.
- **Normalization** is five lines: find the first close in the returned range (first trading day ≥ seed.asOf), let that be `baseline`, then emit `{ date, nav: seedValue × (close / baseline) }` for every close.
- **State carries `benchmarkSeries?: NavPoint[]` + `benchmarkTicker?: string`.** NavCard renders a third polyline when both are present and the series has at least 2 points.
- **Failure mode:** one `MissingHistoricalPrices` warning, keyed by the benchmark ticker. The other two lines render unchanged.

## Data flow

```
config.benchmark ── "SPY" ──┐
                            ▼
 lib/server/dashboard.ts
      └── loadHistoricalCloses("SPY", seed.asOf, endDate)
              │
              ▼
   closes: [{date, close}, …]
              │
              ▼
   normalize: nav_i = seedValue × close_i / close_0
              │
              ▼
 state.benchmarkSeries + state.benchmarkTicker
              │
              ▼
 NavCard → third polyline in medium gray, legend entry "SPY (normalized)"
```

No new modules. Normalization lives inline in `dashboard.ts` where the historical cache is already consulted for held tickers.

## Module contracts

### `lib/model/types.ts`

Add to `Config`:
```ts
benchmark?: string | null;
```

Add to `PortfolioState`:
```ts
benchmarkSeries?: NavPoint[];
benchmarkTicker?: string;
```

### `lib/config.ts`

Extend the config reader to accept an optional `benchmark` field (string or null). Invalid values (non-string, non-null) → ignored with a console warning. Missing → undefined (feature off).

### `lib/server/dashboard.ts`

After the existing historical-fetch block for held tickers, in the same `if (config.marketData.enabled)` branch:

```ts
if (typeof config.benchmark === "string" && config.benchmark.length > 0) {
  const ticker = config.benchmark;
  const res = await loadHistoricalCloses(ticker, seed.asOf, endDate);
  if (res.kind === "ok" && res.closes.length >= 2) {
    const baseline = res.closes[0].close;
    state.benchmarkSeries = res.closes.map(({ date, close }) => ({
      date,
      nav: state.config.seedValue * (close / baseline),
    }));
    state.benchmarkTicker = ticker;
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
```

### `app/components/NavCard.tsx`

Add a third polyline that mirrors the existing Portfolio Value path logic:

- Stroke color: `#6b7280` (Tailwind gray-500), distinct from emerald and violet.
- Dash pattern: `strokeDasharray="5 3"` (the seed reference line uses `"3 3"` so they don't collide visually).
- Y-range calculation includes `benchmarkSeries` if present.
- X-range extends to the later of all three series' endpoints.
- Legend gains one more swatch: `"{benchmarkTicker} (normalized)"` conditional on the series being present.

## Edge cases

| Condition | Behavior |
|---|---|
| `config.benchmark` undefined or null | Skip entirely. No fetch, no state fields. |
| `config.benchmark` non-string | `lib/config.ts` ignores it with a console warning; treated as off. |
| Benchmark fetch errors (network, 404) | `MissingHistoricalPrices` warning with the error message. No line. |
| Benchmark returns fewer than 2 closes | Same as error — need at least two points to draw a line. |
| Benchmark's first close is exactly `seed.asOf` | `baseline` = that close, series starts at `seedValue`. |
| Benchmark's first close is *after* `seed.asOf` (seed on a weekend) | `baseline` = first available close; the line starts at the first trading day in range, not the seed date. Acceptable — user sees the index-relative performance from the first point yahoo has. |
| `config.marketData.enabled === false` | Overlay skipped along with the rest of historical fetching. Single `marketData.enabled` gate covers both. |

## Testing

- **Integration:** extend `tests/integration.test.ts` with a minimal assertion that `state.benchmarkSeries` is present (array, length ≥ 2) when `config.benchmark` is set and the dashboard is ready; absent when the config has no `benchmark`.
- **No dedicated unit test file.** Normalization is five lines of straight arithmetic inside `dashboard.ts`; covered by the integration shape check.
- **Manual smoke in dev:**
  - Set `data/config.json` → `"benchmark": "SPY"`, reload. Third gray-dashed line renders alongside Options Income and Portfolio Value. Legend has three entries.
  - Set `"benchmark": "BADTICKER"`, reload. AttentionBanner lists "Historical closes unavailable for BADTICKER …". Existing two lines still render.
  - Remove the field / set to `null`, reload. Reverts cleanly to two lines + legend.

## Files

**Modified:**
- `lib/model/types.ts` — `benchmark?` on `Config`; `benchmarkSeries?` + `benchmarkTicker?` on `PortfolioState`
- `lib/config.ts` — read and validate the new `benchmark` field
- `lib/server/dashboard.ts` — fetch + normalize + attach (or warn)
- `app/components/NavCard.tsx` — third polyline + legend + range expansion
- `tests/integration.test.ts` — shape assertion
- `tests/config.test.ts` — parse a config with `benchmark` set
