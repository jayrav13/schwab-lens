# Overview page — design

**Issue:** [#4](https://github.com/jayrav13/schwab-lens/issues/4)
**Status:** Approved 2026-04-29
**Supersedes / extends:** [`2026-04-27-schwab-lens-design.md`](2026-04-27-schwab-lens-design.md) §"`/accounts/[uuid]/overview` — holdings-first"

## Goal

Build the generic per-account dashboard at `/accounts/[uuid]/overview`. This becomes the default per-account landing page and works for every account flavor — IRA + ETFs, brokerage + options, money market, mixed. The companion options page (`/accounts/[uuid]/options`) already exists; this issue adds the universally-applicable view.

## Non-goals

- The two-column "modern dashboard" layout — filed as F1 (#8).
- Auto-reconstruction of historical NAV from transactions + yahoo — F5 (#12).
- Snapshot-aligned TWR / Modified Dietz / MWR — #2 and F7 (#14).
- The full transactions firehose — #5 owns the destination link target.

## Routing

```
app/accounts/[uuid]/
  layout.tsx          (existing — 404s on unknown UUID)
  page.tsx            NEW: server-side 308 redirect to ./overview
  overview/page.tsx   NEW
  options/page.tsx    (existing)
```

- `/accounts/<uuid>` (no trailing segment) → 308 redirect to `/accounts/<uuid>/overview`. Implemented as a server component that calls `redirect(...)` from `next/navigation`.
- Garbled UUID → `notFound()` → 404. Already handled by the existing `[uuid]/layout.tsx`, which validates the UUID before rendering children. The redirect page sits *inside* this layout, so the 404 path takes precedence over the redirect path. No additional work needed.
- Accordingly, the redirect page does not re-validate the UUID itself.

## NAV strip

A top-of-page strip showing the account's current NAV and period change.

### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Account label                                              ⓘ        │
│  $123,456.78                                  +$4,321 (+3.6%) YTD    │
│  [1M] [3M] [YTD●] [1Y] [All]                                         │
└──────────────────────────────────────────────────────────────────────┘
```

### Period selector

- Buttons: `1M`, `3M`, `YTD`, `1Y`, `All`.
- Default: `YTD`.
- URL state: `?period=YTD`. Selecting a period updates the URL via `<Link>` so it's shareable and survives reload. Server-rendered.
- No custom date picker. (Drop the spec's `custom` option for v1.)
- Invalid `?period=` value → fall back to `YTD` silently.

### NAV value & period change

NAV strip computation reuses the existing portfolio TWR series produced by `buildPortfolio` in `lib/model/portfolio.ts` — the same series the options page's `NavCard` renders. We do not introduce a new metrics primitive in this issue.

- **Current NAV:** the last point of `state.portfolioValueSeries` when market data is enabled, otherwise the latest `position_snapshots.total_value` for the account.
- **Period start NAV:** the series point at the period start date, or the closest-on-or-before point. If the period start is before the seed date, clamp to the seed date and label the period as `(seed → today)` in the ⓘ popover.
- **Period change %:** `(end − start) / start`. **Period change $:** `end − start`.
- For `All`, period start = seed date.

### ⓘ inspectability

A `<details>` / popover next to the change %, listing:

- Period requested (e.g. `YTD = 2026-01-01 → today`)
- Effective period start (clamped to seed if necessary)
- Seed date and seed value
- End NAV and end date
- Formula: `(end − start) / start`
- Any active warnings from `state.warnings` (missing historical prices, etc.)
- Note: "Snapshot-aligned TWR is tracked separately — see #2."

This is intentionally a sibling of, not a replacement for, the future `/accounts/[uuid]/_debug/twr` page.

## Top holdings table

Columns: **Symbol · Qty · Avg cost · Price · Value · % of acct · Day Δ**.

- **Source rows:** start from the latest `position_snapshots` row for the account; for any open share position in `state.openSharePositions` not present in the snapshot, append a row using the live quote from `mark_to_market`.
- **Avg cost:** from `state.openSharePositions[*].avgCost` when available; blank otherwise. (Snapshot-only positions don't have a derived cost basis in v1.)
- **Price:** snapshot's `price` if present, otherwise the live quote.
- **Day Δ:** `(price − prevClose) / prevClose` from the yahoo quote. When `prevClose` is missing, render `—`.
- **% of acct:** `value / current_NAV`.
- **Sort:** value desc.
- **Empty state:** "No holdings yet" if the account has neither snapshot rows nor open share positions.
- **No pagination.** Retail accounts have <50 rows; the table just scrolls.

Options legs are **not** included in this table — they live on the options page. Mention this in a small footer note: "Equities and ETFs only. See the Options tab for derivatives."

## Recent transactions

Last 10 rows from `transactions` for this account, newest first. Columns: **Date · Action · Symbol · Qty · Amount**.

- Pulls directly from `lib/db/repos/transactions.listTransactionsByAccount`, sliced to the most recent 10 by `transaction_date`.
- Action shown as the canonical enum (e.g. `BUY`, `SELL_TO_OPEN`, `DIVIDEND`).
- Footer link: `View all transactions →` pointing to `/accounts/[uuid]/transactions`. The destination page is owned by #5 and may not exist yet — the link is acceptable as a forward reference. (We do not stub the destination route in this issue.)
- **Empty state:** "No transactions yet."

## Allocation chart

A segmented horizontal bar split by `asset_type`, with a per-symbol breakdown shown only for the equity slice.

### Bar

```
┌──────────────────────────────────────────────────────────────────────┐
│ ████████████ Equity 64% │ ████ Option 18% │ ██ Cash 12% │ █ Other 6% │
└──────────────────────────────────────────────────────────────────────┘
```

- One segment per `asset_type` bucket: `EQUITY`, `OPTION`, `CASH`, `OTHER`.
- Width proportional to slice value / current NAV. Each segment labeled with the bucket name and `%`.
- Implemented in pure CSS flexbox with deterministic colors per bucket. No charting lib.
- **Asset-type source:**
  - Snapshot rows: `position_snapshots.asset_type`.
  - Open share positions outside the snapshot: bucket as `EQUITY`.
  - Open option positions: bucket as `OPTION` (value sourced from `mark_to_market` if available, else 0).
  - Account cash: bucket as `CASH` using `state.cash` (or equivalent existing field).
  - Anything else: `OTHER`.

### Equity sub-table

Below the bar, a compact table: **Symbol · Value · % of equity**, top 10 by value, with an `Other` row aggregating the tail. Only the equity bucket gets this treatment in v1; other buckets do not expand.

### Empty state

If NAV is zero or undeterminable, render "Allocation unavailable — no holdings."

## Data loader

New file: `lib/server/accountOverview.ts`.

```ts
export type AccountOverviewView =
  | { kind: "ready";
      account: Account;
      nav: NavStripData;
      holdings: HoldingRow[];
      recentTransactions: Transaction[];
      allocation: AllocationData;
      warnings: PortfolioWarning[];
      loadedAt: string; }
  | { kind: "no-data"; account: Account }
  | null;  // unknown UUID — page calls notFound()

export async function loadAccountOverviewView(
  uuid: string,
  opts: { period: PeriodKey; db?: Database; includeMarketData?: boolean },
): Promise<AccountOverviewView>;
```

- Reuses `buildPortfolio`, `loadHistoricalCloses`, `fetchQuotes`, `computeMarkToMarket`, `chooseSeed` — the same primitives `loadAccountOptionsView` uses.
- **Not** wrapped around `loadAccountOptionsView`. The two loaders share helpers but compose them differently. We extract any shared helper that emerges (e.g. a function to build `state` + market data) into a small module both can call; we do not couple the two views through one loader.

## Components

New, in `app/components/`:

- `OverviewNavStrip.tsx` — server component, renders the strip + period buttons; period popover is a `<details>` element so it works without client JS.
- `HoldingsTable.tsx` — server component.
- `RecentTransactionsTable.tsx` — server component. Distinct from the existing `TransactionLogCard.tsx` (which has options-page-specific framing); we keep them separate to avoid feature creep on the existing component.
- `AllocationBar.tsx` — server component, pure CSS bar + equity sub-table.

The page (`app/accounts/[uuid]/overview/page.tsx`) wires them together.

## Period semantics

```ts
type PeriodKey = "1M" | "3M" | "YTD" | "1Y" | "All";
```

Computed in ET (consistent with the rest of the app):

| Period | Start                                  | End            |
|--------|----------------------------------------|----------------|
| `1M`   | today − 1 calendar month               | today (or yesterday in ET if market data uses prior close) |
| `3M`   | today − 3 calendar months              | today          |
| `YTD`  | Jan 1 of current year                  | today          |
| `1Y`   | today − 1 calendar year                | today          |
| `All`  | seed date                              | today          |

If the computed start is before the seed date, clamp to the seed date. The ⓘ popover surfaces this.

## Testing

Unit tests for the new loader and any extracted period helper. UI surfaces are validated through the manual test plan in the issue. No new e2e harness in this issue.

Specifically:

- `lib/server/accountOverview.test.ts` — happy path with fixture data; no-data branch; unknown UUID → `null`.
- `lib/server/period.test.ts` (or wherever `PeriodKey` resolution lives) — period start computation incl. clamping below seed.

## Acceptance mapping (Issue #4)

| Acceptance criterion | Where addressed |
|----------------------|----------------|
| Route `app/accounts/[uuid]/overview/page.tsx`              | "Routing" |
| NAV strip with current NAV, period change, period selector, ⓘ | "NAV strip" |
| Top holdings table                                          | "Top holdings table" |
| Recent transactions (last 10)                              | "Recent transactions" |
| Allocation chart                                            | "Allocation chart" |
| `/accounts/[uuid]` → 308 to `/overview`                     | "Routing" |
| Unknown UUID → 404                                          | "Routing" (existing layout) |

## Open questions

None.
