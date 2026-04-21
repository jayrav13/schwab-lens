# Demo tracker — v1 design

**Date:** 2026-04-20
**Status:** Design approved by user, ready for implementation plan

## Purpose

A personal web dashboard for tracking performance over time of the Schwab "Demo" account, which runs the wheel strategy (cash-secured puts → covered calls on assignment). Goal is *measuring* performance, not monitoring live positions or placing trades.

Trading is done out of the separate `~/Code/tenor` Rails app, which has a `/schwab-lens` option screener. This tracker is deliberately decoupled from that.

## Scope

### v1 (this spec)

Four dashboard cards, all derivable from a single Schwab CSV export:

1. **Options Income — NAV over time** — cash + shares at cost basis, plotted at each transaction date
2. **Premiums collected** — monthly gross/closed/net, stacked bars
3. **Open positions** — current short options + assigned share lots, no live quotes
4. **Transaction log** — searchable / filterable raw transactions

### v2 (immediately after v1 works, tracked as GitHub issues)

- Premium by ticker
- How contracts resolved (win rate)
- Cash & ancillary yield (dividends, interest, fees)
- Return metrics (total, annualized, monthly)
- Capital at risk
- Follow-on: mark-to-market NAV using live share quotes (the "Portfolio Value" metric from the xlsx; adds a market-data dependency)

## Stack and architecture

- **Framework:** Next.js (App Router, TypeScript). User is learning the Node ecosystem in this repo — prefer idiomatic Node/TS.
- **Rendering model:** Server-rendered single page. On each request, a server component reads the newest CSV from `data/`, parses + derives, passes state to card components. Small interactive bits (transaction-log search) are client components.
- **Persistence:** None. Stateless — newest `data/*.csv` is the source of truth, re-parsed on every page load. File is <50 KB, re-parse is cheap.
- **Styling:** Tailwind CSS.
- **Testing:** Vitest.

### File layout

```
app/
  page.tsx                    # server component: calls buildPortfolio, renders
  components/
    SummaryStrip.tsx          # top KPI row (NAV, return %, cash, shares at cost)
    NavCard.tsx
    PremiumsCard.tsx
    OpenPositionsCard.tsx
    TransactionLogCard.tsx    # 'use client' — filter/search UI
    OnboardingCard.tsx        # shown when data/ is empty
    AttentionBanner.tsx       # shown for unknown actions or sanity failures
lib/
  csv/parse.ts                # parseSchwabCsv(text) → Transaction[]
  model/portfolio.ts          # buildPortfolio(txs, config) → PortfolioState
  model/metrics/
    nav.ts
    premiums.ts
    positions.ts
  config.ts                   # readConfig() → { seedDate, seedValue }
data/                         # gitignored — CSV + config.json live here
tests/
  fixtures/
  csv/parse.test.ts
  model/portfolio.test.ts
  model/metrics/*.test.ts
docs/superpowers/specs/
```

## Data model

### Input — raw Schwab CSV

Eight columns: `Date, Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount`.

Format quirks the parser must handle:

- `Date` may be `"04/20/2026 as of 04/17/2026"` — trade date is the "as of" value when present; otherwise the only date.
- Monetary fields arrive as `"$39.34"`, `"-$53.66"`, or empty. Empty = 0 for `Amount`, N/A for `Price` / `Fees`.
- Option `Symbol` encodes the contract: `"IREN 04/24/2026 42.50 P"` → ticker `IREN`, expiry `2026-04-24`, strike `42.50`, type `Put`.
- `Expired` and `Assigned` rows have empty `Price` and `Amount` (no cash movement).
- Embedded commas occur inside the quoted `Description` — use a real CSV parser (`papaparse`), not split-on-comma.

### Normalized `Transaction`

```ts
type Action =
  | "SellToOpen" | "BuyToClose" | "Expired" | "Assigned"
  | "Buy" | "Sell"
  | "QualifiedDividend"
  | "BankInterest" | "CreditInterest"
  | "Journal" | "WireSent" | "MiscCashEntry" | "ServiceFee"

type OptionLeg = { ticker: string; expiry: string; strike: number; type: "Put" | "Call" }

type Transaction = {
  tradeDate: string          // ISO yyyy-mm-dd (the "as of" value when present)
  action: Action
  ticker?: string            // present for everything except pure cash rows
  option?: OptionLeg         // present for SellToOpen / BuyToClose / Expired / Assigned
  quantity: number           // contracts for options, shares for stock
  price?: number
  fees: number               // always non-negative; 0 if absent
  amount: number             // signed cash impact (+ = into account)
  raw: RawCsvRow             // kept for the Transaction Log card
}
```

### Config — `data/config.json`

```json
{ "seedDate": "2026-01-15", "seedValue": 12345 }
```

Gitignored. No in-UI settings for v1.

## Derivation pipeline

Pure function `buildPortfolio(transactions, config) → PortfolioState`. Ordered steps:

1. **Sort transactions** by `tradeDate`, stable (preserves intra-day CSV order).
2. **Cash ledger** — walk forward from `config.seedValue` on `config.seedDate`. Apply `amount` from each row. Emit one `CashPoint` per trade date (last value of the day wins).
3. **External flows** — `Journal` and `WireSent` are the only "external" actions. Tracked separately; their cash impact stays in the ledger, but the return % formula subtracts their cumulative sum.
4. **Share positions** — fold `Buy` / `Sell` into per-ticker state: running share count + weighted-average cost basis. Put-assignments and call-assignments are handled via the same fold because Schwab emits explicit paired `Buy` / `Sell` rows alongside each `Assigned` row.
5. **Option positions** — fold `SellToOpen` / `BuyToClose` / `Expired` / `Assigned` into per-contract state keyed on `ticker|expiry|strike|type`. `SellToOpen` adds quantity + premium; the other three subtract quantity. Contracts with `quantityOpen > 0` after the fold are open short positions.
6. **NAV series** ("Options Income") — at each trade date: `cash + Σ(shares × weighted cost basis)`.
7. **Premium series** — per-date sum of amounts where action is `SellToOpen` or `BuyToClose`.
8. **Premium totals** — `gross` = Σ STO, `closed` = |Σ BTC|, `net` = gross − closed.

### Return % formula

```
return% = (nav_now − seedValue − Σ(externalFlows)) / seedValue
```

External flows cover future contributions and withdrawals that shouldn't distort strategy performance. Everything else (premiums, dividends, interest, fees) is part of performance.

### `PortfolioState` shape

```ts
type PortfolioState = {
  config: Config
  cashLedger: CashPoint[]              // { date, balance } per trade date
  externalFlows: FlowPoint[]           // { date, signedAmount } — Journal + WireSent only
  navSeries: NavPoint[]                // { date, nav }
  openOptionPositions: OpenOption[]    // contract + quantityOpen + netPremiumCollected + entries
  openSharePositions: OpenShare[]      // ticker + shares + weightedCostBasis
  premiumSeries: PremiumPoint[]        // { date, netAmount }
  premiumTotals: { gross: number; closed: number; net: number }
}
```

## UI layout

- **Header row** — title ("Demo · Options Income"), seed value + date, source CSV filename, last refresh timestamp.
- **Summary strip** (4 KPIs across): NAV, Return %, Cash, Shares at cost.
- **Row 1:** NAV chart (2/3 width) + Premiums stacked bars (1/3 width).
- **Row 2:** Open positions (half width) + Transaction log (half width, with search/action/date filters).

The sections above are the canonical layout spec. A reference mockup was built during brainstorming at `.superpowers/brainstorm/18541-1776734177/content/dashboard-mockup-v2.html` using numbers derived from the real CSV. That path is gitignored and ephemeral; if it's missing, this spec is the source of truth.

### Card behavior notes

- **NavCard:** SVG line chart of `navSeries`. Dashed horizontal at seed value. No interactive tooltip in v1.
- **PremiumsCard:** monthly bars, gross (green) stacked above closed (light red). Legend shows totals.
- **OpenPositionsCard:** two sections — "Short options" (sorted by expiry ascending) and "Share holdings" (sorted alphabetically). No action buttons.
- **TransactionLogCard:** client component. Filters: free-text search over ticker+description, action dropdown, date range. Initial render: the 20 most recent rows by `tradeDate` (ties broken by CSV order). Pagination is a "Show more" button that reveals the next 20.

## Error handling

1. **No CSV in `data/`** → render `OnboardingCard` explaining the drop-zone workflow and expected filename pattern.
2. **Missing `data/config.json`** → render a setup panel with a copy-pastable default. Do not silently default; seed value is user-specific.
3. **Malformed CSV row** → parser throws with row number and raw line. Page catches and renders an error card showing the offending line so we can extend the parser.
4. **Unknown `Action`** → parser records it, excludes it from cash math, and raises an `AttentionBanner` on the page. Fail loud.
5. **Post-derivation sanity checks** (warnings, not crashes):
   - Cash balance from the walk-forward ledger matches `seedValue + Σ(all amounts)` within $0.01 (guards against floating-point accumulation drift).
   - No share position is negative after processing all same-date transactions for that ticker. (Intermediate negatives within a single date are OK — e.g., SGOV same-day Sell-then-Buy — only the end-of-date state is checked.)
   - Every `Assigned` row has a same-day paired `Buy` or `Sell` at strike.
6. Other internal errors propagate — let Next.js dev overlay handle them. No defensive try/catch outside the parse and file-I/O boundaries.

## Testing

**Framework:** Vitest.

**Unit tests:**

- `parseSchwabCsv` fixtures covering: `as of` dates, empty monetary fields, option-symbol parsing (including half-strikes like `$42.50`), cash-only rows, share Buy/Sell, embedded commas in Description, unknown `Action`.
- `buildPortfolio` fixtures covering: put-assignment → share buy, call-assignment → share sell zero-out, SGOV same-day round-trip, external flow exclusion from return %.

**Integration test:** parse the real sanitized CSV, build portfolio, assert:

- Final NAV ≈ $28,609.85
- Open contracts count = 5
- Open share tickers ⊆ {HL, SOFI, CLSK}
- Net premium ≈ $3,609

**Fixtures:** live in `tests/fixtures/`. Small hand-built CSVs per scenario + one sanitized copy of the real export (ticker-level data is fine; no account numbers). These are source code and tracked in git.

**Pre-commit:** lefthook runs `vitest run` and `tsc --noEmit`. Optional for v1; nice-to-have.

## Data hygiene

Reinforcement of the rule in `CLAUDE.md`:

- `data/`, `transactions/`, `sheets/` are gitignored and must stay so.
- `*.csv` and `*.xlsx` are always considered sensitive — no exceptions.
- Tests use *sanitized* fixtures only; real exports never go to the repo.
- Every commit and PR check must confirm no sensitive files are staged.

## Open questions — none

All v1 decisions closed during brainstorming. Follow-ons tracked as v2 GitHub issues after the repo is remoted.

## References

- `~/Code/tenor` — Rails app with the `/schwab-lens` screener used to place trades; same developer workflow conventions (issue → branch → PR).
- `sheets/Covered Call Balance Sheet.xlsx` (gitignored) — user's existing manual tracker; source of the "Options Income" terminology and the $25k / 2026-01-15 seed.
- `.superpowers/brainstorm/18541-1776734177/content/dashboard-mockup-v2.html` — visual reference for the v1 layout (gitignored brainstorm artifact; may not persist).
