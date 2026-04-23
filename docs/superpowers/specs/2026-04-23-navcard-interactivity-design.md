# NavCard Interactivity (v3) — Design

**Date:** 2026-04-23
**Status:** Draft — awaiting review
**Issue:** [#11](https://github.com/jayrav13/schwab-lens/issues/11)
**Depends on:** #9 (Portfolio Value line, shipped), #12 (benchmark overlay, shipped)

## Problem

NavCard now renders up to three time-series lines — Options Income (cash + shares at cost), Portfolio Value (cash + shares at market), and an optional benchmark (normalized index). Static SVG is no longer enough: reading exact values on a given date, comparing lines at a point, and zooming into a recent window all become worth doing interactively once the card carries more than one series.

## Goals

- Add a hover tooltip that reports the date and each visible series' value on mouseover, with a vertical scrubber and per-series crosshair markers.
- Add a range-preset selector (1M, 3M, 6M, YTD, All) that filters the X window; both axes rescale.
- Add a legend-click toggle that hides/shows each series, with the guarantee that at least one series stays visible.
- Add tap-to-pin on touch devices so the tooltip is reachable without a hover.
- Do all of this without introducing a runtime charting dependency — extend the existing hand-rolled SVG.

## Non-goals (this feature)

- Panning or free-form zoom — deferred to a follow-up if a preset-based window stops being enough.
- Comparison bands (e.g. SPY benchmark overlay) — owned by #12, already shipped.
- Historical-cache changes — owned by #9.
- URL-synced or persisted chart state. The chart is one card on a dense dashboard; component-local `useState` is enough, and refresh-resets-to-defaults matches the glance-level nature of the interaction.

## Design summary

- **`NavCard` converts to a pure client component** (`"use client"` at the top). Props shape unchanged — the server still passes the full `PortfolioState`. No server-side changes.
- **Three pieces of component-local state:** `range: RangePreset`, `hidden: Set<SeriesKey>`, `pinned: { xMs: number } | null`. Everything else is derived each render.
- **All chart math moves to pure functions in `lib/model/chart.ts`:** `filterSeriesByRange`, `nearestPointByMs`, `computeYRange`. These are the testable core; the JSX in `NavCard` is a thin layer over them, verified by manual smoke.
- **Axes always rescale to what's currently visible** — both the range preset and the hidden set feed into X/Y scale computation. This is explicit in the issue's success criteria.
- **No new runtime dependencies.** The card extends the existing hand-rolled SVG.

## Architecture

### State model (all local, all `useState`)

| State | Type | Purpose | Default |
|---|---|---|---|
| `range` | `"1M" \| "3M" \| "6M" \| "YTD" \| "All"` | Which X-window the user picked | `"All"` (matches today's static behavior) |
| `hidden` | `Set<SeriesKey>` | Which series the legend has toggled off | `new Set()` |
| `pinned` | `{ xMs: number } \| null` | Tap-to-pin state for touch | `null` |

`SeriesKey = "incomeSeries" | "valueSeries" | "benchmarkSeries"`. Not all three are always present — `valueSeries` and `benchmarkSeries` are optional on `PortfolioState`. Only series that actually exist participate in the legend and the `hidden` set.

A fourth `useState`, `hoverXMs: number | null`, tracks the mouse's current ms position for the ephemeral scrubber. It updates on `mousemove` and clears on `mouseleave`. When both `hoverXMs` and `pinned` are set, `hoverXMs` takes precedence on render (mouse hover wins over a prior touch pin). No memoization until profiling says otherwise.

### Data flow

```
PortfolioState (from server)
    │
    ▼
NavCard (client)
    │
    ├── range ─────────┐
    ├── hidden ────────┤
    │                  ▼
    │         filterSeriesByRange(series, range, asOfDate)
    │                  │
    │                  ▼
    │         visibleSeries: NavPoint[][]
    │                  │
    │                  ▼
    │         computeYRange(visibleSeries, seedValue) → { yMin, yMax }
    │                  │
    │                  ▼
    │         path rendering
    │
    ├── mousemove ─────┐
    ├── touchstart ────┤
    │                  ▼
    │         nearestPointByMs(series, targetMs) per visible series
    │                  │
    │                  ▼
    │         scrubber + markers + tooltip
    │
    └── legend click → mutate hidden
```

## Module contracts

### `lib/model/chart.ts` (new)

```ts
import type { NavPoint } from "./types";

export type RangePreset = "1M" | "3M" | "6M" | "YTD" | "All";

// Clip a series to the preset window, anchored at asOfDate.
// "1M" = asOfDate minus 30 days; "3M" = 90; "6M" = 180;
// "YTD" = Jan 1 of asOfDate's year; "All" = no filter.
// Returns a new array. Empty input → empty output.
// Preset window entirely before first point → empty output.
export function filterSeriesByRange(
  series: NavPoint[],
  preset: RangePreset,
  asOfDate: string,   // YYYY-MM-DD
): NavPoint[];

// Given a date-sorted series and a target x (ms since epoch),
// return the nearest point. Binary search. Ties: earlier point wins.
// Empty series → null.
export function nearestPointByMs(
  series: NavPoint[],
  targetMs: number,
): NavPoint | null;

// Given a list of visible series and the seed value, compute { yMin, yMax }
// with the existing 10% pad. All-empty fallback: [seedValue * 0.9, seedValue * 1.1].
// Always includes seedValue in the range so the seed reference line renders.
export function computeYRange(
  visibleSeries: NavPoint[][],
  seedValue: number,
): { yMin: number; yMax: number };
```

### `app/components/NavCard.tsx` (rewritten)

- `"use client"` directive.
- Imports `filterSeriesByRange`, `nearestPointByMs`, `computeYRange` from `lib/model/chart`.
- State: `range`, `hidden`, `pinned` as described above, plus a single ephemeral `hoverXMs: number | null` for mouse tracking.
- Event handlers: `onMouseMove`, `onMouseLeave`, `onTouchStart`. A `useEffect` mounts a `document` `touchstart` listener that clears `pinned` when the tap is outside the chart container (detected by `contains()` on a `ref`).
- Renders:
  - Range buttons row at top
  - SVG chart body (polylines + scrubber + markers)
  - X-axis tick labels row (unchanged shape)
  - Legend row, with hidden entries at 40% opacity
  - Floating tooltip element, positioned `absolute` relative to the chart container
- Tooltip position: prefer cursor's right; flip to left if it would overflow the container's right edge; top-aligned with cursor's Y.
- "At least one visible" enforcement: given `present = { series on state with >= 2 points }`, the legend click handler computes `visible = present \ hidden`. If a hide click would empty `visible`, the handler no-ops.

### Not modified

- `lib/server/dashboard.ts`, `lib/model/types.ts`, `app/page.tsx` — no server-side or props-shape changes.

## UI behaviors (details)

### Hover tooltip (mouse)

- On `mousemove` over the chart container, compute cursor clientX → chart-local X → ms → nearest point per visible series.
- Vertical scrubber: full-height line at that ms.
- Markers: small filled circle on each visible series' nearest point.
- Tooltip rows: date (YYYY-MM-DD), then one row per visible series with swatch, name, `$value`, and `(+X.X% from seed)`. Percent is always computed against `state.config.seedValue` (not against the first visible point), consistent with the rest of the dashboard.

### Tap-to-pin (touch)

- `onTouchStart` on the chart sets `pinned = { xMs }`.
- `document` `touchstart` listener clears `pinned` when the target is outside the chart container.
- No explicit dismiss button — tap outside feels native and keeps the card uncluttered.

### Range selector

- Row of five buttons above the chart: `1M 3M 6M YTD All`. Active preset is filled; inactive are outlined.
- `asOfDate` for range math: the latest point across all three series (not today's real date). The dashboard is retrospective; the chart should anchor to the data, not the wall clock.
- Clicking updates `range`; axes and tick labels rescale on the next render.

### Legend toggle

- Clicking a legend entry toggles its `SeriesKey` in `hidden`.
- Hidden entries: 40% opacity on swatch + label, full-opacity again when re-toggled.
- Last-visible-series click: no-op (no visible error). Implemented as an early return in the handler when `visibleCount <= 1`.

### Deterministic rendering

- Fixed `h-[180px]` container and `viewBox="0 0 600 180"` mean only path `d` attributes change — no layout shift when the tooltip appears.
- Tooltip is `position: absolute` inside the chart container; does not affect the flow of siblings.
- Pure client component: no server-rendered SVG markup to mismatch with on hydration.

## Edge cases

| Condition | Behavior |
|---|---|
| Range preset leaves <2 visible points in a series | That series' path is omitted (same `>= 2` threshold as today); legend entry stays so the user can widen the preset. |
| Range preset leaves every visible series with <2 points | Chart area renders with axes only, no polylines. Range buttons stay clickable; "All" recovers. No error message — the buttons are the affordance. |
| User clicks the last visible legend entry | No-op. Handler checks that `present \ (hidden ∪ {clicked})` is non-empty before mutating `hidden`. |
| Hybrid touch + mouse device | Mouse `mousemove` drives an ephemeral hover; touch `touchstart` sets `pinned`; when mouse hover is active it takes precedence on render. Mouse `mouseleave` clears hover only; `pinned` survives. |
| Cursor leaves chart container | `onMouseLeave` clears ephemeral hover. Scrubber, markers, tooltip disappear. `pinned` unaffected. |
| Seed date inside the 1M window | Seed reference line renders across the full filtered X range (horizontal, independent of points). |
| YTD preset when asOfDate is in January | Window is Jan-1 → asOfDate; may be a very short window. Rendered as-is; no special casing. |
| Benchmark series absent (feature off in config) | Legend shows two entries; chart shows two lines; range/toggle behavior unchanged. |
| `state.navSeries.length < 2` | Existing `EmptyCard` branch at the top of `NavCard` still triggers; no interactive chrome rendered. |

## Testing

**Unit (`tests/model/chart.test.ts`, new):**
- `filterSeriesByRange`:
  - `"All"` returns input unchanged
  - 1M/3M/6M correctly trim based on asOfDate
  - YTD handles the Jan-1 boundary
  - Empty input → empty output
  - Window entirely before series start → empty output
  - Single-point series → empty output for any windowed preset (need ≥2 to draw)
- `nearestPointByMs`:
  - Target before first point → first
  - Target after last point → last
  - Target equidistant between two points → earlier wins (deterministic tiebreak)
  - Empty series → null
- `computeYRange`:
  - Multi-series: global min/max with 10% pad
  - All visible empty → seed-based fallback `[seedValue * 0.9, seedValue * 1.1]`
  - Single visible series works
  - `seedValue` is always inside the returned range (so the seed reference line renders)

**Manual smoke in dev:**
- Hover over chart → scrubber + markers + tooltip appear and track cursor. No layout shift.
- Click `1M` → chart zooms; click `All` → back to full range. X-axis tick labels rescale.
- Click a legend entry → that series' line disappears, legend opacity dims. Click again → reappears. Attempt to click the last visible entry → nothing happens.
- On phone: tap chart → tooltip pins. Tap elsewhere on the page → tooltip clears. Re-tap → pins to new location.
- Reload page → range resets to `All`, all series visible (verifies no URL/localStorage leakage).

## Files

**New:**
- `lib/model/chart.ts` — `RangePreset`, `filterSeriesByRange`, `nearestPointByMs`, `computeYRange`
- `tests/model/chart.test.ts` — unit tests for the three pure functions

**Modified:**
- `app/components/NavCard.tsx` — `"use client"`; consumes the three pure fns; adds range buttons, legend toggle, hover/pin handlers, tooltip. Replaces today's static implementation in full.

**Not modified:**
- `lib/server/dashboard.ts`, `lib/model/types.ts`, `app/page.tsx` — no server-side or props-shape changes.
- `package.json` — no new dependencies.
