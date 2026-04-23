# NavCard Benchmark Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a third polyline on NavCard showing a normalized benchmark (default SPY) cumulative return, driven by a single opt-in config field that reuses the existing historical-close cache from #9.

**Architecture:** `Config` gains `benchmark?: string | null`. When set, `loadDashboard` fetches that ticker's history via the existing `loadHistoricalCloses`, normalizes closes to `seedValue × (close / baseline)`, and attaches the resulting series to state. NavCard draws a gray-dashed third line when present. Failures surface as a `MissingHistoricalPrices` warning; the other two lines keep rendering.

**Tech Stack:** TypeScript 5, Vitest, Next.js 16 App Router (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-04-23-benchmark-overlay-design.md`

**Branch strategy:** Session pattern is direct-to-`main` in small commits; each task below ends with one commit.

**Pre-flight (before Task 1):**
- Confirm clean working tree: `git status`
- Confirm tests pass on the base: `npm test`

---

## File Structure

**Modify:**
- `lib/model/types.ts` — `benchmark?: string | null` on `Config`; `benchmarkSeries?: NavPoint[]` + `benchmarkTicker?: string` on `PortfolioState`
- `lib/config.ts` — parse + validate the new optional `benchmark` field
- `tests/config.test.ts` — cover the new field's parse behavior
- `lib/server/dashboard.ts` — fetch benchmark closes, normalize, attach (or warn)
- `tests/integration.test.ts` — shape assertion on `benchmarkSeries`
- `app/components/NavCard.tsx` — third polyline + legend + range expansion

No new modules.

---

## Task 1: Types + config parsing

**Files:**
- Modify: `lib/model/types.ts`
- Modify: `lib/config.ts`
- Modify: `tests/config.test.ts`

- [ ] **Step 1: Extend types**

In `lib/model/types.ts`, update `Config`:

```ts
export type Config = {
  seedDate: string;
  seedValue: number;
  marketData: { enabled: boolean };
  benchmark?: string | null;
};
```

And update `PortfolioState` — add alongside `portfolioValueSeries`:

```ts
benchmarkSeries?: NavPoint[];
benchmarkTicker?: string;
```

- [ ] **Step 2: Write failing tests for config parsing**

Open `tests/config.test.ts` and append:

```ts
describe("parseConfig benchmark field", () => {
  it("omits benchmark when the field is absent", () => {
    const cfg = parseConfig(
      JSON.stringify({
        seedDate: "2026-01-15",
        seedValue: 12345,
        marketData: { enabled: true },
      }),
    );
    expect(cfg.benchmark).toBeUndefined();
  });

  it("accepts a non-empty string benchmark", () => {
    const cfg = parseConfig(
      JSON.stringify({
        seedDate: "2026-01-15",
        seedValue: 12345,
        marketData: { enabled: true },
        benchmark: "SPY",
      }),
    );
    expect(cfg.benchmark).toBe("SPY");
  });

  it("accepts explicit null as off", () => {
    const cfg = parseConfig(
      JSON.stringify({
        seedDate: "2026-01-15",
        seedValue: 12345,
        marketData: { enabled: true },
        benchmark: null,
      }),
    );
    expect(cfg.benchmark).toBeNull();
  });

  it("treats a non-string, non-null benchmark as undefined", () => {
    const cfg = parseConfig(
      JSON.stringify({
        seedDate: "2026-01-15",
        seedValue: 12345,
        marketData: { enabled: true },
        benchmark: 42,
      }),
    );
    expect(cfg.benchmark).toBeUndefined();
  });

  it("treats an empty string benchmark as undefined", () => {
    const cfg = parseConfig(
      JSON.stringify({
        seedDate: "2026-01-15",
        seedValue: 12345,
        marketData: { enabled: true },
        benchmark: "",
      }),
    );
    expect(cfg.benchmark).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/config.test.ts`
Expected: the 5 new tests FAIL (parseConfig doesn't know about `benchmark` yet, so `cfg.benchmark` is always undefined — the "accepts a non-empty string" and "accepts explicit null" tests should be the only real fails; the other three pass coincidentally because `undefined` matches).

That's fine — TDD is about proving the field-handling path exists, not about every test necessarily failing.

- [ ] **Step 4: Update `parseConfig`**

Replace the body of `parseConfig` in `lib/config.ts` with a version that reads `benchmark`:

```ts
export function parseConfig(json: string): Config {
  const parsed = JSON.parse(json) as Partial<Config> & {
    marketData?: { enabled?: unknown };
    benchmark?: unknown;
  };

  if (typeof parsed.seedDate !== "string") {
    throw new Error("config.seedDate must be a string in YYYY-MM-DD format");
  }
  if (!ISO_DATE.test(parsed.seedDate)) {
    throw new Error(
      `config.seedDate must be YYYY-MM-DD; got "${parsed.seedDate}"`,
    );
  }
  if (typeof parsed.seedValue !== "number" || !Number.isFinite(parsed.seedValue)) {
    throw new Error("config.seedValue must be a finite number");
  }

  const marketDataEnabled =
    parsed.marketData?.enabled === true ? true : false;

  let benchmark: string | null | undefined;
  if (parsed.benchmark === null) {
    benchmark = null;
  } else if (typeof parsed.benchmark === "string" && parsed.benchmark.length > 0) {
    benchmark = parsed.benchmark;
  } else {
    benchmark = undefined;
  }

  return {
    seedDate: parsed.seedDate,
    seedValue: parsed.seedValue,
    marketData: { enabled: marketDataEnabled },
    benchmark,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/config.test.ts`
Expected: all tests pass (existing ones still green, 5 new ones now green).

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/model/types.ts lib/config.ts tests/config.test.ts
git commit -m "Add Config.benchmark and PortfolioState benchmark-series fields

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Dashboard wiring — fetch, normalize, attach

**Files:**
- Modify: `lib/server/dashboard.ts`
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Extend `loadDashboard` to fetch and normalize**

Open `lib/server/dashboard.ts`. Inside the existing `if (config.marketData.enabled)` block, *after* the held-tickers loop and the `computePortfolioValueSeries` call (i.e. after `state.portfolioValueSeries = pv.series;` and its warnings push), add:

```ts
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
```

The benchmark fetch should live inside the same `if (config.marketData.enabled)` branch, and inside the same `if (endDate >= seed.asOf)` guard, so it shares the same date-range sanity check as the held-tickers pass.

- [ ] **Step 2: Extend the integration test**

In `tests/integration.test.ts`, inside `describe("loadDashboard", ...)`, add:

```ts
it("exposes benchmarkSeries when config.benchmark is a non-empty string and marketData is enabled", async () => {
  const result = await loadDashboard();
  if (result.kind !== "ready") return;
  if (!result.state.config.marketData.enabled) return;

  const bench = result.state.config.benchmark;
  if (typeof bench === "string" && bench.length > 0) {
    // Either the fetch succeeded (series populated) OR it failed and was warned.
    const warned = result.state.warnings.some(
      (w) => w.kind === "MissingHistoricalPrices" && w.ticker === bench,
    );
    const hasSeries =
      Array.isArray(result.state.benchmarkSeries) &&
      (result.state.benchmarkSeries?.length ?? 0) >= 2 &&
      result.state.benchmarkTicker === bench;
    expect(hasSeries || warned).toBe(true);
  } else {
    expect(result.state.benchmarkSeries).toBeUndefined();
    expect(result.state.benchmarkTicker).toBeUndefined();
  }
});
```

- [ ] **Step 3: Typecheck + tests**

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/server/dashboard.ts tests/integration.test.ts
git commit -m "Fetch and normalize benchmark history in loadDashboard

When config.benchmark is a non-empty string, fetch that ticker's
historical closes via the existing loadHistoricalCloses cache,
normalize each close to seedValue × (close / baseline), and attach the
resulting series to state.benchmarkSeries. Failures surface a
MissingHistoricalPrices warning; the other two NAV lines keep
rendering unaffected.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: NavCard renders the third line

**Files:**
- Modify: `app/components/NavCard.tsx`

- [ ] **Step 1: Add the benchmark polyline**

Open `app/components/NavCard.tsx`. The existing file already handles two series (`incomePoints` / `valuePoints`). Extend to three.

Replace the current body from `const valuePoints: NavPoint[] = …` down through the `allNavs` / `firstMs` / `lastMs` calculations to include the benchmark series. Specifically:

```tsx
const valuePoints: NavPoint[] =
  state.portfolioValueSeries && state.portfolioValueSeries.length >= 2
    ? state.portfolioValueSeries
    : [];

const benchmarkPoints: NavPoint[] =
  state.benchmarkSeries && state.benchmarkSeries.length >= 2
    ? state.benchmarkSeries
    : [];

const allNavs = [
  state.config.seedValue,
  ...points.map((p) => p.nav),
  ...valuePoints.map((p) => p.nav),
  ...benchmarkPoints.map((p) => p.nav),
];
const minNav = Math.min(...allNavs);
const maxNav = Math.max(...allNavs);
const pad = (maxNav - minNav) * 0.1 || 1;
const yMin = minNav - pad;
const yMax = maxNav + pad;

const firstMs = Math.min(
  Date.parse(points[0].date),
  ...(valuePoints.length ? [Date.parse(valuePoints[0].date)] : []),
  ...(benchmarkPoints.length ? [Date.parse(benchmarkPoints[0].date)] : []),
);
const lastMs = Math.max(
  Date.parse(points.at(-1)!.date),
  ...(valuePoints.length ? [Date.parse(valuePoints.at(-1)!.date)] : []),
  ...(benchmarkPoints.length ? [Date.parse(benchmarkPoints.at(-1)!.date)] : []),
);
```

Then, after the existing `valuePath` derivation, add a corresponding benchmark path:

```tsx
const valuePath = valuePoints.length ? pathOf(valuePoints) : null;
const benchmarkPath = benchmarkPoints.length ? pathOf(benchmarkPoints) : null;
```

In the `<svg>` children, directly after the existing `{valuePath && (...)}` block, add:

```tsx
{benchmarkPath && (
  <path
    d={benchmarkPath}
    stroke="#6b7280"
    strokeWidth="2"
    strokeDasharray="5 3"
    fill="none"
  />
)}
```

Finally, update the legend block — after the existing `{valuePath && (...)}` legend entry:

```tsx
{benchmarkPath && state.benchmarkTicker && (
  <span>
    <span className="inline-block w-2.5 h-2.5 align-middle rounded-sm bg-gray-500 mr-1" />
    {state.benchmarkTicker} (normalized)
  </span>
)}
```

Also extend the subtitle text to mention the benchmark when present:

```tsx
<p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
  Options Income: cash + shares at cost basis, at each trade date.
  {valuePath
    ? " Portfolio Value: cash + shares at daily market close, through T-1."
    : ""}
  {benchmarkPath && state.benchmarkTicker
    ? ` ${state.benchmarkTicker} (normalized): starts at seed value, grows by index return.`
    : ""}
</p>
```

- [ ] **Step 2: Typecheck + lint + tests**

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm run lint`
Expected: 0 errors (pre-existing `mkdirSync` warning is fine).

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Visual smoke (requires dev server)**

1. Temporarily edit `data/config.json` to add `"benchmark": "SPY"`.
2. Run `npm run dev` (disable sandbox if needed). Open `http://localhost:3000`.
3. Verify NavCard shows three lines — emerald (Options Income), violet (Portfolio Value), and gray-dashed SPY. Legend has three entries.
4. Try `"benchmark": "BADTICKER"`. Reload. AttentionBanner lists "Historical closes unavailable for BADTICKER …" and the two existing lines still render.
5. Remove the `benchmark` field or set `"benchmark": null`. Reload. NavCard reverts to two lines cleanly.
6. Revert your local edits to `data/config.json` (do NOT commit a benchmark change — the config is personal).

- [ ] **Step 4: Commit**

```bash
git add app/components/NavCard.tsx
git commit -m "Render benchmark overlay as a third line on NavCard

Closes #12.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: End-to-end smoke**

Already covered by Task 3 Step 3 if it was run live. If skipped there, do it now.

- [ ] **Step 5: Hygiene check**

Run: `git status && git diff --cached`
Verify: no `data/config.json` change staged, no real financial data staged.
