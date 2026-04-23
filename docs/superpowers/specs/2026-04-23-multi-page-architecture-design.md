# Multi-Page Architecture + Filters — Design

**Tracking issue:** jayrav13/schwab-lens#13
**Date:** 2026-04-23

## Goal

Introduce a lightweight multi-page layout so the dashboard stays an "at-a-glance" view while two heavy tables — closed trades and transactions — move to dedicated pages with filter / sort / date-range UX. State is URL-synced so reloads and shared links are reproducible. No new backend state.

## Scope

**In scope**
- Top-level nav in `app/layout.tsx` (Dashboard / Trades / Transactions)
- New routes: `/trades`, `/transactions`
- `/trades`: ticker multi-select, outcome multi-select, close-date range, sortable columns (closeDate, daysHeld, netPnL), result count + aggregate P&L summary
- `/transactions`: action multi-select, ticker multi-select, date range, free-text search (already exists on the card), sort by date
- Dashboard `TradeHistoryCard` shrinks to "last 5 rows + View all N →"
- Dashboard `TransactionLogCard` shrinks to "last 10 rows + View all N →" (removes the embedded filter UI; that moves to `/transactions`)
- URL-synced filter state via `?ticker=…&outcome=…&from=…&to=…&sort=…` on both pages
- Dark-mode parity with existing cards

**Out of scope**
- Premium-by-ticker breakout page
- CSV export from filtered views
- Saved filter presets / named views
- Server-side pagination (client-side filtering is fine at current volume: ~76 trades, ~hundreds of transactions)
- Virtualization

## Architecture

### File layout

```
app/
  layout.tsx                         # + <AppNav/>
  page.tsx                           # dashboard (unchanged orchestration, plus trimmed previews)
  trades/
    page.tsx                         # server component: loads data, renders client
  transactions/
    page.tsx                         # server component: loads data, renders client
  components/
    AppNav.tsx                       # client: horizontal nav, highlights active path
    TradeHistoryCard.tsx             # dashboard preview (last 5 + link)
    TransactionLogCard.tsx           # dashboard preview (last 10 + link) — filter UI removed
    TradesPageClient.tsx             # full /trades UX (filters, sort, summary)
    TransactionsPageClient.tsx       # full /transactions UX (filters, sort, search)

lib/
  model/
    filters/
      trades.ts                      # pure: filterTrades(), sortTrades()
      transactions.ts                # pure: filterTransactions(), sortTransactions()
```

Pure filter/sort helpers under `lib/model/filters/` keep the logic testable (the components are mostly wiring).

### Data flow

Each route calls `loadDashboard()` server-side. `PortfolioState` already contains everything the two new pages need (`state.closedTrades` for `/trades`, `state.transactions` for `/transactions`). No new derivations or endpoints.

**Performance note.** `loadDashboard()` currently does market-data work (historical closes per held ticker, benchmark, live quotes) that `/trades` and `/transactions` don't need. To avoid paying that on every nav, `loadDashboard()` gains an options arg:

```ts
loadDashboard({ includeMarketData?: boolean = true })
```

- `/` → `loadDashboard()` (default: includes market data)
- `/trades`, `/transactions` → `loadDashboard({ includeMarketData: false })`

When `includeMarketData: false`, we skip the `if (config.marketData.enabled)` block entirely. `state.portfolioValueSeries`, `state.benchmarkSeries`, `markToMarket`, and `latestSnapshot` end up absent/null on those pages — which is fine because neither page reads them.

### Shared nav

`AppNav` is a minimal client component (needs `usePathname()` for active-link styling):

```
Demo    Dashboard   Trades   Transactions
```

Rendered by `app/layout.tsx` above `{children}`. No additional chrome — each page keeps its own header (the existing dashboard header stays on `/`; `/trades` and `/transactions` get simpler headers showing page title + record count).

### URL contract

**`/trades`**

| Param | Type | Example | Meaning |
|-------|------|---------|---------|
| `ticker` | comma list | `AAPL,NVDA` | include trades whose `contract.ticker` is in the set |
| `outcome` | comma list | `Expired,Assigned` | one or more of `Expired|Assigned|ClosedProfit|ClosedLoss` |
| `from` | ISO date | `2026-01-15` | closeDate ≥ from |
| `to` | ISO date | `2026-04-23` | closeDate ≤ to |
| `sort` | key:dir | `closeDate:desc` | key ∈ `closeDate|daysHeld|netPnL`, dir ∈ `asc|desc` |

Default sort: `closeDate:desc`. Empty/absent filters = no filter on that axis.

**`/transactions`**

| Param | Type | Example | Meaning |
|-------|------|---------|---------|
| `action` | comma list | `SellToOpen,BuyToClose` | one or more canonical action names |
| `ticker` | comma list | `AAPL` | include transactions whose `ticker` is in the set |
| `from` | ISO date | `2026-01-15` | tradeDate ≥ from |
| `to` | ISO date | `2026-04-23` | tradeDate ≤ to |
| `q` | string | `dividend` | free-text across ticker + description |
| `sort` | key:dir | `tradeDate:desc` | key ∈ `tradeDate|amount`, dir ∈ `asc|desc` |

Default sort: `tradeDate:desc`.

Both pages update the URL with `router.replace(...)` on filter change (no history entries per keystroke; state still survives reload).

### UX details

**`/trades`**
- Header row: "Closed trades · N matching · net $X" (aggregates recompute with filters)
- Filter bar: 4 controls laid out in a horizontal row on wide screens, stacked on mobile
  - Ticker: popover multi-select listing unique tickers from `state.closedTrades`
  - Outcome: popover multi-select with the 4 fixed outcomes
  - From / To: two `<input type="date">`s
  - "Clear all" button visible when any filter is active
- Table: same 7 columns as the current card, but headers are sortable (click to toggle asc/desc; active column gets an arrow indicator)

**`/transactions`**
- Header row: "Transactions · N matching · net $X"
- Filter bar: action multi-select, ticker multi-select, from/to, free-text search
- Table: same row layout as the current card body (date / action badge + description / amount), with a sortable date column (amount sort is low-value but cheap to add)
- No "show more" pagination needed — render all filtered rows (a few hundred max)

**Dashboard previews**
- `TradeHistoryCard`: shows last 5 trades (closeDate desc); footer `View all N →` linking to `/trades`
- `TransactionLogCard`: shows last 10 transactions (tradeDate desc); footer `View all N →` linking to `/transactions`. Removes its internal search and action filter — those live on the full page now
- Trimming is local to these components; the dashboard page doesn't change its grid layout

## Testing strategy

- Unit tests for pure helpers in `lib/model/filters/trades.ts` and `lib/model/filters/transactions.ts` — covers:
  - Each filter axis alone
  - Compound filters (AND across axes)
  - Sort correctness including tie-break
  - Empty input / empty filter-set edge cases
- UI wiring is exercised manually in the browser (consistent with the rest of this codebase — no component tests exist today)
- Existing integration tests (`loadDashboard` shape) continue to pass; we'll add a case that calls `loadDashboard({ includeMarketData: false })` and asserts `portfolioValueSeries`/`benchmarkSeries` are absent

## Risks

- `loadDashboard({ includeMarketData: false })` skip has to match reality — needs explicit test coverage so we don't accidentally leak market-data calls onto `/trades`
- Three separate server loads per nav round-trip means each route re-parses CSVs. Fine for a single user, but if it becomes visible we can share a module-level cache later (out of scope here)
- URL param parsing needs to handle malformed values without crashing (bad outcome names, non-ISO dates) — helpers should clamp to "no filter" rather than throwing

## Implementation order (preview — real plan follows)

1. Extract `filterTrades` / `sortTrades` + tests
2. Extract `filterTransactions` / `sortTransactions` + tests
3. Add `includeMarketData` option to `loadDashboard`; test the skip
4. Add `AppNav` + wire into `layout.tsx`
5. Build `/trades` page + `TradesPageClient`; shrink dashboard's `TradeHistoryCard`
6. Build `/transactions` page + `TransactionsPageClient`; shrink dashboard's `TransactionLogCard`
7. Manual browser smoke: filters, deep links, dark mode, all three pages

## Open questions

1. **Preview row counts** — 5 for trades, 10 for transactions, per the issue. Confirm or tweak.
2. **`/` header** — the existing dashboard header stays; should I add the same `AppNav` above it, or keep the header at the top and nav inside? Proposing `AppNav` above the header, full-width, consistent across all three pages.
3. **Empty-state copy on filtered pages** — "No trades match these filters." + a Clear-all button. OK?
