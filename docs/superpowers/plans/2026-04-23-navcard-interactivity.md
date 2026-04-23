# NavCard Interactivity (v3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `NavCard` interactive — hover tooltip, range-preset selector, legend toggle, and tap-to-pin on touch — without introducing a charting dependency.

**Architecture:** Convert `NavCard` to a pure client component with component-local `useState`. Extract three pure functions (`filterSeriesByRange`, `nearestPointByMs`, `computeYRange`) into `lib/model/chart.ts` with vitest unit tests; the JSX is a thin layer over them, verified by manual smoke.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, vitest, Tailwind. No new runtime dependencies.

**Related docs:**
- Spec: `docs/superpowers/specs/2026-04-23-navcard-interactivity-design.md`
- Issue: [#11](https://github.com/jayrav13/schwab-lens/issues/11)
- Branch: `fix/11-navcard-interactivity` (create at start)

**Project hard rule (from `CLAUDE.md`):** before every commit, run `git status` and `git diff --cached` and verify no files under `transactions/`, `sheets/`, `data/`, and no `*.csv` / `*.xlsx` are staged.

---

## File map

| File | Role |
|---|---|
| `lib/model/chart.ts` (new) | `RangePreset` type + three pure functions consumed by `NavCard`. Zero framework deps. |
| `tests/model/chart.test.ts` (new) | Unit tests for the three pure functions. |
| `app/components/NavCard.tsx` (rewritten) | Pure client component. Replaces today's static implementation in full. Imports the three pure functions. |

Not modified: `lib/model/types.ts`, `lib/server/dashboard.ts`, `app/page.tsx`, `package.json`.

---

## Task 0: Create branch

**Files:** none

- [ ] **Step 1: Create and switch to feature branch**

Run:
```bash
git checkout -b fix/11-navcard-interactivity
```
Expected: switched to a new branch.

---

## Task 1: `filterSeriesByRange` (TDD)

Clips a date-sorted series to a range-preset window anchored at an `asOfDate`. Empty input → empty output. Window before first point → empty. Single point in range returned as-is (caller enforces `>= 2` for drawability).

**Files:**
- Create: `lib/model/chart.ts`
- Test: `tests/model/chart.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/model/chart.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { filterSeriesByRange } from "@/lib/model/chart";
import type { NavPoint } from "@/lib/model/types";

const daily: NavPoint[] = [
  { date: "2026-01-15", nav: 100 },
  { date: "2026-02-01", nav: 110 },
  { date: "2026-03-01", nav: 120 },
  { date: "2026-04-01", nav: 130 },
  { date: "2026-04-20", nav: 140 },
];

describe("filterSeriesByRange", () => {
  it("'All' returns input unchanged", () => {
    expect(filterSeriesByRange(daily, "All", "2026-04-20")).toEqual(daily);
  });

  it("empty input returns empty output for every preset", () => {
    for (const preset of ["1M", "3M", "6M", "YTD", "All"] as const) {
      expect(filterSeriesByRange([], preset, "2026-04-20")).toEqual([]);
    }
  });

  it("'1M' keeps points within 30 days of asOfDate", () => {
    // asOf 2026-04-20; window starts 2026-03-21
    const out = filterSeriesByRange(daily, "1M", "2026-04-20");
    expect(out.map((p) => p.date)).toEqual(["2026-04-01", "2026-04-20"]);
  });

  it("'3M' keeps points within 90 days of asOfDate", () => {
    // asOf 2026-04-20; window starts 2026-01-20
    const out = filterSeriesByRange(daily, "3M", "2026-04-20");
    expect(out.map((p) => p.date)).toEqual([
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-04-20",
    ]);
  });

  it("'6M' keeps points within 180 days of asOfDate", () => {
    const out = filterSeriesByRange(daily, "6M", "2026-04-20");
    expect(out.map((p) => p.date)).toEqual([
      "2026-01-15",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-04-20",
    ]);
  });

  it("'YTD' keeps points from Jan 1 of asOfDate's year onward", () => {
    const mixed: NavPoint[] = [
      { date: "2025-11-01", nav: 90 },
      { date: "2025-12-31", nav: 95 },
      { date: "2026-01-15", nav: 100 },
      { date: "2026-04-20", nav: 140 },
    ];
    const out = filterSeriesByRange(mixed, "YTD", "2026-04-20");
    expect(out.map((p) => p.date)).toEqual(["2026-01-15", "2026-04-20"]);
  });

  it("window entirely before series start returns empty", () => {
    const out = filterSeriesByRange(
      [{ date: "2022-01-01", nav: 50 }],
      "1M",
      "2026-04-20",
    );
    expect(out).toEqual([]);
  });

  it("returns a single in-range point as-is (caller handles drawability)", () => {
    const out = filterSeriesByRange(
      [{ date: "2026-04-10", nav: 120 }],
      "1M",
      "2026-04-20",
    );
    expect(out).toEqual([{ date: "2026-04-10", nav: 120 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run tests/model/chart.test.ts
```
Expected: FAIL with "Cannot find module '@/lib/model/chart'" or similar.

- [ ] **Step 3: Write minimal implementation**

Create `lib/model/chart.ts`:

```ts
import type { NavPoint } from "./types";

export type RangePreset = "1M" | "3M" | "6M" | "YTD" | "All";

const DAY_MS = 24 * 60 * 60 * 1000;

function windowStartMs(preset: RangePreset, asOfDate: string): number | null {
  const asOfMs = Date.parse(asOfDate);
  switch (preset) {
    case "1M":
      return asOfMs - 30 * DAY_MS;
    case "3M":
      return asOfMs - 90 * DAY_MS;
    case "6M":
      return asOfMs - 180 * DAY_MS;
    case "YTD": {
      const year = asOfDate.slice(0, 4);
      return Date.parse(`${year}-01-01`);
    }
    case "All":
      return null;
  }
}

export function filterSeriesByRange(
  series: NavPoint[],
  preset: RangePreset,
  asOfDate: string,
): NavPoint[] {
  if (series.length === 0) return [];
  if (preset === "All") return series;
  const startMs = windowStartMs(preset, asOfDate);
  if (startMs === null) return series;
  return series.filter((p) => Date.parse(p.date) >= startMs);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/model/chart.test.ts
```
Expected: 8 passing.

- [ ] **Step 5: Commit**

Run:
```bash
git status
git diff --cached
```
Verify no CSV/xlsx files, no files under `transactions/`, `sheets/`, `data/`. Then:

```bash
git add lib/model/chart.ts tests/model/chart.test.ts
git commit -m "$(cat <<'EOF'
Add filterSeriesByRange pure fn + tests

First chart helper: clips a date-sorted NavPoint series to a
range-preset window (1M/3M/6M/YTD/All) anchored at asOfDate.
Caller enforces the >= 2 drawability threshold.

Part of #11.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `nearestPointByMs` (TDD)

Given a date-sorted series and a target ms timestamp, returns the point whose date is closest. Ties: earlier wins. Empty → null.

**Files:**
- Modify: `lib/model/chart.ts`
- Modify: `tests/model/chart.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/model/chart.test.ts` (below the existing `describe` block, still inside the file):

```ts
import { nearestPointByMs } from "@/lib/model/chart";

describe("nearestPointByMs", () => {
  const s: NavPoint[] = [
    { date: "2026-01-15", nav: 100 },
    { date: "2026-02-01", nav: 110 },
    { date: "2026-03-01", nav: 120 },
  ];

  it("returns null for an empty series", () => {
    expect(nearestPointByMs([], Date.parse("2026-02-15"))).toBeNull();
  });

  it("returns the first point when target is before the series", () => {
    const out = nearestPointByMs(s, Date.parse("2025-06-01"));
    expect(out?.date).toBe("2026-01-15");
  });

  it("returns the last point when target is after the series", () => {
    const out = nearestPointByMs(s, Date.parse("2027-01-01"));
    expect(out?.date).toBe("2026-03-01");
  });

  it("picks the closer of two adjacent points", () => {
    // Closer to 2026-02-01 than to 2026-03-01
    const out = nearestPointByMs(s, Date.parse("2026-02-05"));
    expect(out?.date).toBe("2026-02-01");
  });

  it("tiebreak: equidistant target picks the earlier point", () => {
    // 2026-01-16 is 15 days after Jan 1 and 16 days before Feb 1.
    // Use an exact midpoint: halfway between Jan 1 and Feb 1 (31-day month).
    const jan = Date.parse("2026-01-15");
    const feb = Date.parse("2026-02-01");
    const mid = jan + (feb - jan) / 2;
    const out = nearestPointByMs(s, mid);
    expect(out?.date).toBe("2026-01-15");
  });
});
```

Note the import is combined on a new line at the top — move both imports together when merging. If the existing import is `import { filterSeriesByRange } from "@/lib/model/chart";`, replace it with `import { filterSeriesByRange, nearestPointByMs } from "@/lib/model/chart";` and drop the inline `import { nearestPointByMs } ...` line above.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run tests/model/chart.test.ts
```
Expected: FAIL with "nearestPointByMs is not exported".

- [ ] **Step 3: Write minimal implementation**

Append to `lib/model/chart.ts`:

```ts
export function nearestPointByMs(
  series: NavPoint[],
  targetMs: number,
): NavPoint | null {
  if (series.length === 0) return null;
  // Binary search for insertion index
  let lo = 0;
  let hi = series.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Date.parse(series[mid].date) < targetMs) lo = mid + 1;
    else hi = mid;
  }
  // Candidates: series[lo] and series[lo - 1]
  const cand = [series[lo]];
  if (lo > 0) cand.unshift(series[lo - 1]);
  // Pick the one with smallest |date - target|; tie → earlier
  let best = cand[0];
  let bestDelta = Math.abs(Date.parse(best.date) - targetMs);
  for (let i = 1; i < cand.length; i++) {
    const delta = Math.abs(Date.parse(cand[i].date) - targetMs);
    if (delta < bestDelta) {
      best = cand[i];
      bestDelta = delta;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/model/chart.test.ts
```
Expected: 13 passing (8 previous + 5 new).

- [ ] **Step 5: Commit**

```bash
git status
git diff --cached
```
Verify no sensitive files staged. Then:

```bash
git add lib/model/chart.ts tests/model/chart.test.ts
git commit -m "$(cat <<'EOF'
Add nearestPointByMs pure fn + tests

Binary search over a date-sorted NavPoint series for the point
whose date is closest to a target ms. Ties: earlier point wins.
Empty series returns null. Used by NavCard to snap the hover
scrubber to real data points per series.

Part of #11.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `computeYRange` (TDD)

Computes `{ yMin, yMax }` across all visible series with a 10% pad (matching today's behavior). Always includes `seedValue` in the range so the seed reference line renders. All-empty fallback: `[seedValue * 0.9, seedValue * 1.1]`.

**Files:**
- Modify: `lib/model/chart.ts`
- Modify: `tests/model/chart.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend the top-of-file import in `tests/model/chart.test.ts` to:
```ts
import {
  filterSeriesByRange,
  nearestPointByMs,
  computeYRange,
} from "@/lib/model/chart";
```

Append a new describe block at the bottom:

```ts
describe("computeYRange", () => {
  it("computes min/max across multi-series with a 10% pad", () => {
    const a: NavPoint[] = [
      { date: "2026-01-15", nav: 100 },
      { date: "2026-02-01", nav: 200 },
    ];
    const b: NavPoint[] = [
      { date: "2026-01-15", nav: 150 },
      { date: "2026-02-01", nav: 180 },
    ];
    const { yMin, yMax } = computeYRange([a, b], 100);
    // raw min = 100, raw max = 200, pad = (200 - 100) * 0.1 = 10
    expect(yMin).toBe(90);
    expect(yMax).toBe(210);
  });

  it("always includes seedValue in the range", () => {
    const a: NavPoint[] = [
      { date: "2026-01-15", nav: 500 },
      { date: "2026-02-01", nav: 600 },
    ];
    const { yMin, yMax } = computeYRange([a], 100);
    expect(yMin).toBeLessThanOrEqual(100);
    expect(yMax).toBeGreaterThanOrEqual(600);
  });

  it("single-series: min/max from that series + seed", () => {
    const a: NavPoint[] = [
      { date: "2026-01-15", nav: 120 },
      { date: "2026-02-01", nav: 150 },
    ];
    const { yMin, yMax } = computeYRange([a], 100);
    // Raw min = 100 (seed), raw max = 150, pad = (150 - 100) * 0.1 = 5
    expect(yMin).toBe(95);
    expect(yMax).toBe(155);
  });

  it("all-empty fallback: [seed * 0.9, seed * 1.1]", () => {
    const { yMin, yMax } = computeYRange([], 10000);
    expect(yMin).toBe(9000);
    expect(yMax).toBe(11000);

    const { yMin: yMin2, yMax: yMax2 } = computeYRange([[], []], 10000);
    expect(yMin2).toBe(9000);
    expect(yMax2).toBe(11000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run tests/model/chart.test.ts
```
Expected: FAIL with "computeYRange is not exported".

- [ ] **Step 3: Write minimal implementation**

Append to `lib/model/chart.ts`:

```ts
export function computeYRange(
  visibleSeries: NavPoint[][],
  seedValue: number,
): { yMin: number; yMax: number } {
  const navs = visibleSeries.flatMap((s) => s.map((p) => p.nav));
  if (navs.length === 0) {
    return { yMin: seedValue * 0.9, yMax: seedValue * 1.1 };
  }
  const withSeed = [...navs, seedValue];
  const rawMin = Math.min(...withSeed);
  const rawMax = Math.max(...withSeed);
  const pad = (rawMax - rawMin) * 0.1 || 1;
  return { yMin: rawMin - pad, yMax: rawMax + pad };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run tests/model/chart.test.ts
```
Expected: 17 passing (13 previous + 4 new).

- [ ] **Step 5: Commit**

```bash
git status
git diff --cached
```
Verify no sensitive files staged. Then:

```bash
git add lib/model/chart.ts tests/model/chart.test.ts
git commit -m "$(cat <<'EOF'
Add computeYRange pure fn + tests

Y-axis range computation across multi-series with 10% pad.
Always includes seedValue so the seed reference line renders.
All-empty fallback: [seed * 0.9, seed * 1.1].

Part of #11.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rewrite `NavCard` as a client component — range selector + legend toggle

Full replacement of `app/components/NavCard.tsx`. Adds `"use client"`, `useState` for `range` and `hidden`, range buttons, clickable legend with the "at least one visible" guard. No tooltip yet (Task 5) and no tap-to-pin (Task 6); mouse-event props are wired but effectively inert until then.

**Files:**
- Modify: `app/components/NavCard.tsx`

- [ ] **Step 1: Replace the file in full**

Write `app/components/NavCard.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavPoint, PortfolioState } from "@/lib/model/types";
import {
  computeYRange,
  filterSeriesByRange,
  nearestPointByMs,
  type RangePreset,
} from "@/lib/model/chart";

type Props = { state: PortfolioState };

type SeriesKey = "incomeSeries" | "valueSeries" | "benchmarkSeries";

type SeriesDef = {
  key: SeriesKey;
  label: string;
  color: string;
  dash?: string;
  points: NavPoint[];
};

const RANGE_PRESETS: RangePreset[] = ["1M", "3M", "6M", "YTD", "All"];
const CHART_W = 600;
const CHART_H = 180;

export function NavCard({ state }: Props) {
  const [range, setRange] = useState<RangePreset>("All");
  const [hidden, setHidden] = useState<Set<SeriesKey>>(() => new Set());
  const [pinned, setPinned] = useState<{ xMs: number } | null>(null);
  const [hoverXMs, setHoverXMs] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Suppress unused-variable lint noise until Task 5/6 wire these up.
  void pinned;
  void setPinned;
  void hoverXMs;
  void setHoverXMs;
  void nearestPointByMs;

  const seriesDefs: SeriesDef[] = useMemo(() => {
    const out: SeriesDef[] = [];
    if (state.navSeries.length >= 2) {
      out.push({
        key: "incomeSeries",
        label: "Options Income",
        color: "#059669",
        points: state.navSeries,
      });
    }
    if (state.portfolioValueSeries && state.portfolioValueSeries.length >= 2) {
      out.push({
        key: "valueSeries",
        label: "Portfolio Value",
        color: "#8b5cf6",
        points: state.portfolioValueSeries,
      });
    }
    if (
      state.benchmarkSeries &&
      state.benchmarkSeries.length >= 2 &&
      state.benchmarkTicker
    ) {
      out.push({
        key: "benchmarkSeries",
        label: `${state.benchmarkTicker} (normalized)`,
        color: "#6b7280",
        dash: "5 3",
        points: state.benchmarkSeries,
      });
    }
    return out;
  }, [
    state.navSeries,
    state.portfolioValueSeries,
    state.benchmarkSeries,
    state.benchmarkTicker,
  ]);

  const asOfDate = useMemo(() => {
    const dates = seriesDefs.flatMap((s) => s.points.map((p) => p.date));
    return dates.length > 0 ? dates.sort().at(-1)! : state.config.seedDate;
  }, [seriesDefs, state.config.seedDate]);

  const visibleDefs = seriesDefs.filter((s) => !hidden.has(s.key));

  const drawable = visibleDefs
    .map((s) => ({ def: s, points: filterSeriesByRange(s.points, range, asOfDate) }))
    .filter((s) => s.points.length >= 2);

  const { yMin, yMax } = computeYRange(
    drawable.map((s) => s.points),
    state.config.seedValue,
  );

  const allMs = drawable.flatMap((s) => s.points.map((p) => Date.parse(p.date)));
  const firstMs = allMs.length ? Math.min(...allMs) : 0;
  const lastMs = allMs.length ? Math.max(...allMs) : 1;
  const xRange = Math.max(1, lastMs - firstMs);

  const scaleX = (ms: number) => ((ms - firstMs) / xRange) * CHART_W;
  const scaleY = (v: number) => CHART_H - ((v - yMin) / (yMax - yMin || 1)) * CHART_H;

  const pathOf = (series: NavPoint[]): string =>
    series
      .map((p, i) => {
        const x = scaleX(Date.parse(p.date));
        const y = scaleY(p.nav);
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

  const incomeDraw = drawable.find((s) => s.def.key === "incomeSeries");
  const seedY = scaleY(state.config.seedValue);

  const tickSource = incomeDraw?.points ?? drawable[0]?.points ?? [];
  const tickCount = Math.min(6, Math.max(0, tickSource.length));
  const ticks =
    tickCount >= 2
      ? Array.from({ length: tickCount }, (_, i) => {
          const idx = Math.floor((i * (tickSource.length - 1)) / (tickCount - 1));
          return tickSource[idx].date.slice(5);
        })
      : [];

  const toggle = useCallback(
    (key: SeriesKey) => {
      setHidden((prev) => {
        if (prev.has(key)) {
          const next = new Set(prev);
          next.delete(key);
          return next;
        }
        const wouldHide = new Set(prev);
        wouldHide.add(key);
        const visibleAfter = seriesDefs
          .map((s) => s.key)
          .filter((k) => !wouldHide.has(k));
        if (visibleAfter.length === 0) return prev;
        return wouldHide;
      });
    },
    [seriesDefs],
  );

  // Placeholder effect slot — Task 6 replaces with outside-tap-clears-pinned.
  useEffect(() => {
    return;
  }, []);

  if (state.navSeries.length < 2) return <EmptyCard />;

  const valueDraw = drawable.find((s) => s.def.key === "valueSeries");
  const benchmarkDraw = drawable.find((s) => s.def.key === "benchmarkSeries");

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        NAV over time
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Options Income: cash + shares at cost basis, at each trade date.
        {valueDraw ? " Portfolio Value: cash + shares at daily market close, through T-1." : ""}
        {benchmarkDraw && state.benchmarkTicker
          ? ` ${state.benchmarkTicker} (normalized): starts at seed value, grows by index return.`
          : ""}
      </p>

      <div className="flex gap-1.5 mb-3">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setRange(p)}
            className={`text-[11px] px-2 py-0.5 rounded border ${
              range === p
                ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-neutral-900 dark:text-gray-300 dark:border-neutral-700 dark:hover:bg-neutral-800"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div
        ref={containerRef}
        className="h-[180px] relative border-l border-b border-gray-200 dark:border-neutral-800"
      >
        <svg
          className="absolute inset-0"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          width="100%"
          height="100%"
        >
          <defs>
            <linearGradient id="nav-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#059669" stopOpacity="0.25" />
              <stop offset="1" stopColor="#059669" stopOpacity="0" />
            </linearGradient>
          </defs>
          {incomeDraw && (
            <path
              d={`${pathOf(incomeDraw.points)} L${CHART_W},${CHART_H} L0,${CHART_H} Z`}
              fill="url(#nav-gradient)"
            />
          )}
          {drawable.map((s) => (
            <path
              key={s.def.key}
              d={pathOf(s.points)}
              stroke={s.def.color}
              strokeWidth={2}
              strokeDasharray={s.def.dash}
              fill="none"
            />
          ))}
          <line
            x1="0"
            y1={seedY}
            x2={CHART_W}
            y2={seedY}
            stroke="#9ca3af"
            strokeDasharray="3,3"
          />
        </svg>
      </div>

      <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1 pl-1">
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500 dark:text-gray-400 mt-2">
        {seriesDefs.map((s) => {
          const isHidden = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              className={`inline-flex items-center ${isHidden ? "opacity-40" : ""}`}
            >
              <span
                className="inline-block w-2.5 h-2.5 align-middle rounded-sm mr-1"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </button>
          );
        })}
        <span className="inline-flex items-center">
          <span className="inline-block w-2.5 h-2.5 align-middle rounded-sm bg-gray-400 mr-1" />
          Seed (${state.config.seedValue.toLocaleString()})
        </span>
      </div>
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">Not enough data points yet.</p>
    </div>
  );
}
```

Note the `void` expressions at the top of the function body — they exist solely to keep the `pinned`/`hoverXMs`/`nearestPointByMs` references alive so the file compiles and lints cleanly *during this intermediate task*. Tasks 5 and 6 remove the `void` lines and actually wire them up.

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Lint**

Run:
```bash
npm run lint
```
Expected: no new errors in `app/components/NavCard.tsx` or `lib/model/chart.ts`.

- [ ] **Step 4: Unit tests still green**

Run:
```bash
npm test
```
Expected: 17+ tests, all green (the 17 from Tasks 1-3 plus any prior project tests).

- [ ] **Step 5: Manual smoke in dev**

Run (in a second terminal or backgrounded):
```bash
npm run dev
```
Open the dashboard. Verify:
- Chart renders at least one line (Options Income). If `benchmark` is configured and historical data is cached, also verify Portfolio Value and benchmark lines render.
- Range buttons appear above the chart; `All` is highlighted by default.
- Click `1M` / `3M` / `6M` / `YTD` / `All` — chart zooms/rescales on each click; X-axis tick labels change accordingly.
- Click a legend entry — that series' line disappears; the entry dims to 40% opacity. Click again — reappears.
- Click the last visible entry — nothing happens (no error, no flash). Re-show one of the hidden entries first, then the click works again.

- [ ] **Step 6: Commit**

```bash
git status
git diff --cached
```
Verify no sensitive files staged. Then:

```bash
git add app/components/NavCard.tsx
git commit -m "$(cat <<'EOF'
NavCard: convert to client component, add range + legend toggles

Makes NavCard a pure client component using component-local
useState. Adds a range-preset selector (1M/3M/6M/YTD/All) above
the chart and clickable legend entries that toggle per-series
visibility, with a guard that keeps at least one series visible.
Axes and tick labels rescale to what's currently visible.

Hover tooltip and tap-to-pin land in follow-up commits.

Part of #11.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Hover tooltip (mouse)

Adds `hoverXMs` state, `onMouseMove` / `onMouseLeave` handlers, scrubber line, per-series markers, and a floating tooltip. Removes the `void hoverXMs; void setHoverXMs; void nearestPointByMs;` placeholders from Task 4.

**Files:**
- Modify: `app/components/NavCard.tsx`

- [ ] **Step 1: Remove the `hoverXMs` / `nearestPointByMs` placeholder lines**

In `NavCard.tsx`, delete these three lines from the top-of-body suppression block:
```tsx
  void hoverXMs;
  void setHoverXMs;
  void nearestPointByMs;
```

Keep `void pinned;` and `void setPinned;` — Task 6 removes those.

- [ ] **Step 2: Add the hover-state derivation**

Find the line:
```tsx
  const allMs = drawable.flatMap((s) => s.points.map((p) => Date.parse(p.date)));
```

Immediately after the block that ends with `const xRange = Math.max(1, lastMs - firstMs);`, add:

```tsx
  const activeXMs = hoverXMs;

  const nearest =
    activeXMs !== null
      ? drawable
          .map((s) => ({ def: s.def, point: nearestPointByMs(s.points, activeXMs) }))
          .filter(
            (n): n is { def: typeof drawable[number]["def"]; point: NavPoint } =>
              n.point !== null,
          )
      : [];

  const activeDate =
    activeXMs !== null ? new Date(activeXMs).toISOString().slice(0, 10) : null;
```

- [ ] **Step 3: Add mouse handlers**

Find the existing `toggle` `useCallback`. Immediately above it, add:

```tsx
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!allMs.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverXMs(firstMs + frac * xRange);
  };
  const handleMouseLeave = () => setHoverXMs(null);
```

- [ ] **Step 4: Wire handlers + render scrubber/markers/tooltip**

Find the chart container `<div>` (the one with `ref={containerRef}` and `className="h-[180px] relative ..."`). Add `onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}` to it:

```tsx
      <div
        ref={containerRef}
        className="h-[180px] relative border-l border-b border-gray-200 dark:border-neutral-800"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
```

Inside the `<svg>` block, after the seed reference `<line ...>` and before the closing `</svg>`, add the scrubber + markers:

```tsx
          {activeXMs !== null && nearest.length > 0 && (
            <>
              <line
                x1={scaleX(activeXMs)}
                y1={0}
                x2={scaleX(activeXMs)}
                y2={CHART_H}
                stroke="#9ca3af"
                strokeWidth={1}
              />
              {nearest.map((n) => (
                <circle
                  key={n.def.key}
                  cx={scaleX(Date.parse(n.point.date))}
                  cy={scaleY(n.point.nav)}
                  r={3.5}
                  fill={n.def.color}
                  stroke="#fff"
                  strokeWidth={1}
                />
              ))}
            </>
          )}
```

Immediately after the closing `</svg>` but still inside the chart container `<div>`, add the tooltip:

```tsx
        {activeXMs !== null && activeDate !== null && nearest.length > 0 && (
          <ChartTooltip
            date={activeDate}
            nearest={nearest}
            seedValue={state.config.seedValue}
            containerW={containerRef.current?.clientWidth ?? 0}
            xPxFrac={xRange > 0 ? (activeXMs - firstMs) / xRange : 0}
          />
        )}
```

- [ ] **Step 5: Add the `ChartTooltip` component**

Add this new component at module scope (immediately above the existing `EmptyCard` function at the bottom of the file):

```tsx
function ChartTooltip(props: {
  date: string;
  nearest: { def: { color: string; label: string; key: string }; point: NavPoint }[];
  seedValue: number;
  containerW: number;
  xPxFrac: number;
}) {
  const { date, nearest, seedValue, containerW, xPxFrac } = props;
  const TOOLTIP_W = 180;
  const xPx = xPxFrac * containerW;
  const flip = xPx > containerW - TOOLTIP_W - 8;
  const left = flip ? xPx - TOOLTIP_W - 8 : xPx + 8;
  const clampedLeft = Math.max(0, Math.min(containerW - TOOLTIP_W, left));
  return (
    <div
      className="absolute top-1 z-10 bg-white/95 dark:bg-neutral-900/95 border border-gray-200 dark:border-neutral-700 rounded px-2 py-1 text-[11px] text-gray-700 dark:text-gray-200 pointer-events-none shadow"
      style={{ left: `${clampedLeft}px`, width: `${TOOLTIP_W}px` }}
    >
      <div className="font-semibold mb-0.5 tabular-nums">{date}</div>
      {nearest.map(({ def, point }) => {
        const pct = ((point.nav - seedValue) / seedValue) * 100;
        return (
          <div key={def.key} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-sm shrink-0"
              style={{ backgroundColor: def.color }}
            />
            <span className="flex-1 truncate">{def.label}</span>
            <span className="tabular-nums">
              ${point.nav.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="tabular-nums text-gray-500 dark:text-gray-400">
              ({pct >= 0 ? "+" : ""}
              {pct.toFixed(1)}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Type-check + lint + tests**

Run:
```bash
npx tsc --noEmit && npm run lint && npm test
```
Expected: no type errors, no new lint errors, all unit tests green.

- [ ] **Step 7: Manual smoke in dev**

With `npm run dev` running, reload the dashboard. Verify:
- Moving the mouse over the chart shows a vertical gray scrubber line that tracks the cursor's X.
- A small circular marker appears on each visible series' nearest point.
- A tooltip appears near the cursor showing the hovered date and one row per visible series: swatch, name, `$value`, and percent-from-seed. Percent formatting: `+X.X%` above seed, `-X.X%` below.
- Tooltip flips from right-of-cursor to left-of-cursor when the cursor nears the right edge of the chart. No horizontal overflow past the card.
- Moving the cursor out of the chart clears the scrubber, markers, and tooltip.
- No layout shift when the tooltip appears or moves — siblings (legend row, tick labels) don't jump.

- [ ] **Step 8: Commit**

```bash
git status
git diff --cached
```
Verify no sensitive files staged. Then:

```bash
git add app/components/NavCard.tsx
git commit -m "$(cat <<'EOF'
NavCard: add hover scrubber + crosshair + tooltip

On mousemove, snap a vertical scrubber to the cursor's X, place
a circular marker on each visible series' nearest point, and
render a floating tooltip listing the hovered date plus each
series' value and percent-from-seed. Tooltip flips sides near
the right edge to stay inside the card.

Part of #11.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Tap-to-pin (touch)

Wires up `pinned` state, `onTouchStart` handler, and a document-level `touchstart` listener that clears `pinned` on taps outside the chart container. Removes the `void pinned; void setPinned;` placeholders from Task 4.

**Files:**
- Modify: `app/components/NavCard.tsx`

- [ ] **Step 1: Remove the `pinned` placeholder lines**

In `NavCard.tsx`, delete the remaining suppression lines at the top of the function body:
```tsx
  void pinned;
  void setPinned;
```

(The whole suppression block — all five `void` lines from Task 4 — should now be gone.)

- [ ] **Step 2: Update `activeXMs` to fall through to `pinned`**

Change:
```tsx
  const activeXMs = hoverXMs;
```

To:
```tsx
  const activeXMs = hoverXMs ?? (pinned ? pinned.xMs : null);
```

- [ ] **Step 3: Replace the placeholder effect with the outside-tap handler**

Change:
```tsx
  // Placeholder effect slot — Task 6 replaces with outside-tap-clears-pinned.
  useEffect(() => {
    return;
  }, []);
```

To:
```tsx
  useEffect(() => {
    if (pinned === null) return;
    const handler = (e: TouchEvent) => {
      const el = containerRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setPinned(null);
    };
    document.addEventListener("touchstart", handler);
    return () => document.removeEventListener("touchstart", handler);
  }, [pinned]);
```

- [ ] **Step 4: Add the touch handler**

Immediately below the existing `handleMouseLeave` definition, add:

```tsx
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!allMs.length) return;
    const t = e.touches[0];
    if (!t) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width));
    setPinned({ xMs: firstMs + frac * xRange });
  };
```

- [ ] **Step 5: Wire the touch handler onto the chart container**

Update the chart container `<div>` to:

```tsx
      <div
        ref={containerRef}
        className="h-[180px] relative border-l border-b border-gray-200 dark:border-neutral-800"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
      >
```

- [ ] **Step 6: Type-check + lint + tests**

Run:
```bash
npx tsc --noEmit && npm run lint && npm test
```
Expected: no type errors, no new lint errors, all unit tests green.

- [ ] **Step 7: Manual smoke — desktop regression**

With `npm run dev` running, reload the dashboard on the desktop browser. Verify the mouse behavior from Task 5 is unchanged (hover tooltip tracks cursor, clears on `mouseleave`).

- [ ] **Step 8: Manual smoke — touch device**

Use Chrome DevTools' device-toolbar (Cmd-Shift-M) with a touchscreen preset, OR open the dashboard on a phone pointed at the dev server (e.g. `http://<laptop-lan-ip>:3000`). Verify:
- Tap anywhere on the chart → scrubber, markers, and tooltip appear at that X and stay pinned.
- Tap a different X on the chart → pin moves to the new location.
- Tap anywhere outside the chart (including elsewhere on the page) → pin clears; scrubber/markers/tooltip disappear.
- Range buttons and legend toggles still work on touch.
- If the device has a hybrid mouse + touch setup (trackpad laptop in DevTools touch emulation): moving the cursor takes visual precedence over a pinned tap.

- [ ] **Step 9: Commit**

```bash
git status
git diff --cached
```
Verify no sensitive files staged. Then:

```bash
git add app/components/NavCard.tsx
git commit -m "$(cat <<'EOF'
NavCard: tap-to-pin tooltip on touch devices

Tap on the chart pins the scrubber + markers + tooltip at that X.
A document-level touchstart listener clears the pin when the tap
lands outside the chart container. Mouse hover takes precedence
over a stale pin on hybrid devices.

Part of #11.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Full verification + PR

Final sanity pass and the PR.

**Files:** none (verification + PR only).

- [ ] **Step 1: Full check**

Run:
```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```
Expected: all green. The build catches any issue that only surfaces during Next.js production compilation (e.g. accidental server-only import in the client file).

- [ ] **Step 2: Full manual smoke checklist**

With `npm run dev` running, walk through every success criterion from issue #11:

- [ ] Hover tooltip (mouse): scrubber, crosshair markers on each series' nearest point, tooltip with date + `$value` + `(% from seed)`.
- [ ] Range selector: all five presets (1M, 3M, 6M, YTD, All) change the visible window; axes and tick labels rescale.
- [ ] Legend toggle: click hides/shows; last-visible guard prevents a fully-empty chart.
- [ ] Touch tap-to-pin: tap pins; outside-tap clears.
- [ ] No layout shift when tooltip appears.
- [ ] No hydration mismatch warnings in the browser console.
- [ ] No new runtime dependencies (`git diff main -- package.json package-lock.json` is empty).

- [ ] **Step 3: Pre-PR safety check**

Run:
```bash
git log main..HEAD --stat
```
Verify no CSV/xlsx files and no files under `transactions/`, `sheets/`, `data/` appear in any commit. If anything sensitive did slip in, STOP and remediate before pushing.

- [ ] **Step 4: Push and open PR**

Run:
```bash
git push -u origin fix/11-navcard-interactivity
gh pr create --title "NavCard interactivity: hover tooltip, range, legend, tap-to-pin (closes #11)" --body "$(cat <<'EOF'
## Summary
- Make `NavCard` interactive: hover tooltip with vertical scrubber and per-series crosshairs, 1M/3M/6M/YTD/All range-preset selector, clickable legend with "at least one visible" guard, and tap-to-pin for touch devices.
- Pure client component; no server-side or props-shape changes. No new runtime dependencies.
- Chart math (range filter, nearest-point lookup, Y-range) extracted to `lib/model/chart.ts` with vitest unit tests. JSX verified by manual smoke.

## Design doc
`docs/superpowers/specs/2026-04-23-navcard-interactivity-design.md`

## Test plan
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] `npm test` — 17+ unit tests pass (Tasks 1-3 functions)
- [ ] `npm run build` clean
- [ ] Manual smoke (see issue #11 success criteria): hover tooltip, range, legend toggle, tap-to-pin, no layout shift, no hydration warnings

Closes #11.

*Co-authored by Claude*
EOF
)"
```

Use merge commits (not squash) per `CLAUDE.md`.

---

## Self-review (for the plan author)

- **Spec coverage:** each success criterion in #11 is addressed — hover tooltip (Task 5), range selector (Task 4), legend toggle (Task 4), touch tap-to-pin (Task 6), deterministic rendering (Task 4 layout + Task 5 `position: absolute`), no new runtime dep (Task 7 verification).
- **Type consistency:** `SeriesKey`, `SeriesDef`, `RangePreset`, `NavPoint` are used identically across tasks. The intermediate `void` suppression in Task 4 is named out explicitly and removed in Tasks 5/6.
- **Pure-function contract matches spec:** `filterSeriesByRange` (Task 1) returns single in-range points as-is; caller applies the `>= 2` drawability threshold. `nearestPointByMs` (Task 2) tiebreak is deterministic (earlier wins). `computeYRange` (Task 3) always includes `seedValue` and has the all-empty fallback.
- **Hooks-rules safety:** in Task 4's `NavCard`, every `useState`/`useMemo`/`useCallback`/`useEffect` call sits above the `if (state.navSeries.length < 2) return <EmptyCard />;` early return. Hook count is stable.
- **No sensitive data:** every commit step runs `git status` and `git diff --cached` first; the CLAUDE.md rule is honored at each commit.
