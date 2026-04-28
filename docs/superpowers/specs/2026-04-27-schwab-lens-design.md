# Schwab Lens — design spec

**Status:** Spec — pending implementation
**Date:** 2026-04-27
**Context:** Rebrand and re-architecture of this repo. Replaces the reverted Phase 1 (`2026-04-24-phase1-sqlite-multi-brokerage-design.md`) and Phase 2 (`2026-04-24-phase2-per-account-projections-design.md`) specs.

## Goal

Build **Schwab Lens** — a local-first, read-only visualization tool for Schwab brokerage accounts. The product takes Schwab's CSV exports as the source of truth, ingests them idempotently into a local SQLite database, and renders multiple per-account dashboards. No data leaves the user's machine. No trading. No multi-brokerage support.

The product is multi-account from the schema up. Each account gets a stable URL identifier (UUID) and a set of dashboard "lenses" — pages that present the same data through different framings (a generic *overview* for all accounts, an *options/wheel-strategy* lens for accounts that trade options).

## Non-goals

- **No multi-brokerage support.** Schwab-only. If another brokerage is ever needed, that becomes a separate repo (`<brokerage>-lens`), not a feature of this one.
- **No trading or portfolio management.** Read-only.
- **No multi-tenancy / accounts / auth.** One OS user, one local SQLite, one machine.
- **No `data/config.json`.** All settings live in DB tables.
- **No `localStorage`-based config.** Stateful settings live in SQLite next to the data they configure.
- **No automatic seed-value derivation.** `accounts.seed_date / seed_value` are NULL by default ("since inception = earliest snapshot"); user opts into backfill via `account:configure`.
- **No precomputed metrics tables in v1.** Compute on read.
- **No watch-mode ingest.** Manual `npm run ingest` only.

## Architecture

```
data/                                   (gitignored)
  portfolio.db                          ← SQLite, derived projection of CSVs
  transactions/
    <Label>_XXX###_Transactions_*.csv
  positions/
    <Label>-Positions-*.csv

lib/
  db/                                   ← connection, migrations, query helpers
    migrate.ts
    connection.ts
    repos/
      accounts.ts
      transactions.ts
      positionSnapshots.ts
      settings.ts
  schwab/                               ← Schwab-only parsing (no abstraction)
    filenames.ts
    identify.ts
    parseTransactions.ts
    parsePositions.ts
    actions.ts                          ← Schwab action string → canonical enum
  metrics/
    twr.ts                              ← snapshot-aligned TWR
    cashflow.ts                         ← classify(action_canonical) → flow|internal|unknown
    navSeries.ts                        ← snapshot-date → NAV
    benchmark.ts                        ← buy-and-hold TWR for a ticker
    holdings.ts
    allocation.ts
  server/
    dashboard.ts                        ← reads from DB, builds page state
  market/                               ← yahoo-finance2 wrapper (existing)

scripts/
  ingest.ts                             ← npm run ingest entry point
  account-configure.ts                  ← npm run account:configure entry point

app/
  page.tsx                              ← / (all-accounts grid + NAV strip)
  accounts/[uuid]/
    page.tsx                            ← 308 redirect to overview
    overview/page.tsx                   ← holdings-first standard view
    options/page.tsx                    ← wheel-strategy overlay (existing dashboard, relocated)
    trades/page.tsx                     ← per-account
    transactions/page.tsx               ← per-account
    _debug/twr/page.tsx                 ← admin-by-convention TWR computation dump
  components/                           ← existing components, scoped to account
    AppNav.tsx                          ← account-aware (picker + per-page tabs)
    OnboardingCard.tsx                  ← updated copy

db/migrations/
  001-initial-schema.sql

.claude/skills/
  ingest/SKILL.md                       ← renamed from ingest, generalized

docs/
  methodology.md                        ← TWR math, divergences from Schwab (created in F6)
  superpowers/
    specs/2026-04-27-schwab-lens-design.md   ← this file
    plans/                              ← implementation plans (writing-plans skill)
```

### Key principles

- **CSVs are source of truth.** The DB is derived. `rm portfolio.db && npm run ingest` returns to identical state.
- **Ingest is lossless.** Every CSV row lands as a DB row with a `raw` JSON column holding the original. Canonical fields are best-effort extractions; future canonical fields can be re-derived from `raw` without re-ingesting.
- **Ingest is idempotent.** Per-row content hashes + `INSERT OR IGNORE`.
- **No `config.json`.** All settings live in `accounts` (per-account) or `settings` (global) tables.
- **UUID is the URL identifier.** `accounts.id` (integer) and `accounts.external_id` (Schwab masked digits) are internal-only.
- **Every issue leaves the site working.** Verified by a manual test plan checklist in each PR.

## Data model

Five tables, one initial migration. All small.

```sql
-- accounts: one row per Schwab account, discovered from CSVs
CREATE TABLE accounts (
  id            INTEGER PRIMARY KEY,
  uuid          TEXT NOT NULL UNIQUE,         -- crypto.randomUUID(), URL-facing
  external_id   TEXT NOT NULL UNIQUE,         -- Schwab masked ID (ingest matching only)
  label         TEXT NOT NULL,                -- from CSV filename, user-displayable
  seed_date     TEXT,                         -- optional backfill: NAV date (NULL = no backfill)
  seed_value    REAL,                         -- optional backfill: NAV at seed_date
  benchmark     TEXT,                         -- e.g., 'SPY', nullable
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL                 -- updated each ingest where this account is touched
);

-- transactions: one row per CSV row, idempotent via content_hash
CREATE TABLE transactions (
  id               INTEGER PRIMARY KEY,
  account_id       INTEGER NOT NULL REFERENCES accounts(id),
  trade_date       TEXT NOT NULL,             -- YYYY-MM-DD
  action_canonical TEXT NOT NULL,             -- enum below; UNKNOWN allowed
  action_raw       TEXT NOT NULL,             -- original Schwab action string
  symbol           TEXT,
  description      TEXT,
  quantity         REAL,
  price            REAL,
  fees             REAL,
  amount           REAL NOT NULL,             -- signed cash impact
  raw              TEXT NOT NULL,             -- JSON of original row (lossless preservation)
  source_file      TEXT NOT NULL,
  content_hash     TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_tx_account_date   ON transactions(account_id, trade_date);
CREATE INDEX idx_tx_account_action ON transactions(account_id, action_canonical);

-- position_snapshots: one row per (account, as_of, symbol)
CREATE TABLE position_snapshots (
  id           INTEGER PRIMARY KEY,
  account_id   INTEGER NOT NULL REFERENCES accounts(id),
  as_of        TEXT NOT NULL,                 -- YYYY-MM-DD
  symbol       TEXT NOT NULL,
  description  TEXT,
  quantity     REAL,
  price        REAL,
  market_value REAL,
  cost_basis   REAL,
  asset_type   TEXT,                          -- 'equity' | 'option' | 'cash' | NULL (extend as encountered)
  raw          TEXT NOT NULL,
  source_file  TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_pos_account_asof   ON position_snapshots(account_id, as_of);
CREATE INDEX idx_pos_account_symbol ON position_snapshots(account_id, symbol, as_of);

-- settings: global key/value
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- migrations: tracks applied migration files
CREATE TABLE migrations (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);
```

### Settings keys (v1)

| Key | Value | Purpose |
| --- | --- | --- |
| `market_data.enabled` | `'true'` / `'false'` | Global yahoo-finance fetch flag |

That's it for v1. No `dashboard.primary_account` key — `/` shows all accounts.

### Canonical action enum

```
BUY, SELL,
BUY_TO_OPEN, SELL_TO_OPEN, BUY_TO_CLOSE, SELL_TO_CLOSE,
ASSIGNMENT, EXERCISE, EXPIRATION,
DIVIDEND, INTEREST, FEE,
JOURNAL, TRANSFER_IN, TRANSFER_OUT,
UNKNOWN
```

`UNKNOWN` is a legal landing state, not an error. Adapters preserve `action_raw` so unmapped actions can be classified later via:

```sql
SELECT action_raw, COUNT(*) FROM transactions
WHERE action_canonical = 'UNKNOWN' GROUP BY action_raw;
```

### Idempotency

`content_hash = SHA-256({external_id, normalized_canonical_row})`. "Normalized" = trimmed whitespace, consistent numeric formatting. Re-exports producing the same row produce the same hash → `INSERT OR IGNORE` makes ingest a no-op. Position snapshots collapse on day-granularity `as_of` (first wins same-day re-export).

Exact JSON canonicalization (sorted keys, number formatting) is an implementation detail picked at plan time; either a deterministic library or a hand-rolled ~20-line utility.

### What's intentionally not here

- No `brokerages` table. Schwab-only.
- No `account_groups` (not in v1 scope).
- No precomputed metrics tables.
- No `dashboard.primary_account` setting.
- No `seed_strategy` enum — `seed_date / seed_value` are simple optional overrides; absent = derive from earliest snapshot.

## Ingest pipeline

Two artifacts: a Claude Code skill for routing files in, and a standalone script that walks the data directory and populates the DB.

### `/ingest` skill (replaces `/ingest`)

User invokes `/ingest` from a Claude Code session. The skill:

1. **Routes files from `~/Downloads`.** Walks `~/Downloads`, matches each file against Schwab filename patterns:
   - Transactions: `/^.+_XXX\d{3}_Transactions_\d{8}-\d{6}\.csv$/`
   - Positions: `/^.+-Positions-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/`
   - Match → `mv -n` into `data/transactions/` or `data/positions/`. No-clobber.
2. **Runs `npm run ingest`.**
3. **Reports** what moved, what stayed in `~/Downloads` (no pattern match), what got inserted/skipped, what new accounts were discovered.

The skill is the user-facing entry point. The script is the actual logic. Either runs independently.

### `npm run ingest` (`scripts/ingest.ts`)

No arguments. Idempotent. Sequence:

1. Run any unapplied migrations.
2. Walk `data/transactions/*.csv` and `data/positions/*.csv`.
3. For each file:
   - **Identify account.**
     - Transactions: parse filename → `{ label, external_id }`. Filename is authoritative for both.
     - Positions: parse filename → `{ label }`; parse first line → `{ label, external_id }` (Schwab Positions CSV header reads `Positions for account <Label> ...<digits> as of ...`). Cross-check labels; log warning on mismatch but continue.
   - **Upsert account row.**
     - `INSERT … ON CONFLICT(external_id) DO UPDATE SET label = excluded.label, last_seen_at = now`.
     - On *insert* (new account): generate `uuid` via `crypto.randomUUID()` and set `first_seen_at = last_seen_at = now`.
   - **Parse rows** via `lib/schwab/parseTransactions.ts` or `lib/schwab/parsePositions.ts` → array of canonical rows.
   - **Insert** with `INSERT OR IGNORE` per row (UNIQUE `content_hash` makes duplicates a no-op).
4. Print summary: files processed, rows inserted, rows skipped (duplicates), accounts touched, unmapped action types with counts.

### Seed values — no auto-derivation

`accounts.seed_date / seed_value` are NULL by default, meaning *"since inception = earliest snapshot."* Users opt into backfill explicitly via `account:configure` only when they want returns extending earlier than their first export.

The reverted Phase 1 spec auto-derived seeds from earliest snapshot. We are *not* doing that. Auto-derivation always landed somewhere not-quite-right; the optional-override mechanism is cleaner.

### `npm run account:configure` admin command

Optional. Run when a user wants to set backfill or change benchmark.

```bash
npm run account:configure -- \
  --account=<uuid-or-external-id> \
  --seed-date=YYYY-MM-DD \
  --seed-value=<number> \
  --benchmark=SPY
```

| Flag | Effect |
| --- | --- |
| `--account=<uuid-or-external-id>` | Required. Targets the account row. Accepts either form for ergonomics. |
| `--seed-date=YYYY-MM-DD` | Sets `accounts.seed_date` |
| `--seed-value=<number>` | Sets `accounts.seed_value` |
| `--benchmark=<ticker>` | Sets `accounts.benchmark` |
| `--label=<text>` | Override label (rare — Schwab filename is usually canonical) |
| `--market-data on\|off` | Toggle global `settings.market_data.enabled` |

`account:configure` is a CLI escape hatch. Most users don't run it. Setting backfill is the main use case.

### First migration on the user's machine

After scrub-and-rebrand and DB swap land:

1. `/ingest` — picks up existing CSVs, populates the DB. Accounts auto-discovered.
2. *(Optional, one-time, only if backfill desired)* `npm run account:configure --account=<external_id> --seed-date=YYYY-MM-DD --seed-value=<n> --benchmark=SPY`.
3. `data/config.json` is now unused; user deletes it.

### Error handling

| Failure | Behavior |
| --- | --- |
| Single row fails to parse | Log row index + raw, continue file |
| Whole file fails to parse | Log + skip file, continue ingest |
| Filename matches no Schwab pattern | Skip file, leave in `~/Downloads` (skill reports) |
| Filename label vs content label disagree | Log warning, ingest with filename label |
| `external_id` collision with different label | Update label to most recently seen, log info |
| DB error (not data error) | Fail fast |

### Out of scope for v1 ingest

- Watch-mode / file-system event-driven ingest.
- Yahoo-finance fetching at ingest time.
- Cross-account validation rules.

### SQLite library and migrations

- **Library:** `better-sqlite3`. Sync, microsecond-fast against a small DB, slots into Server Components without async overhead.
- **Migrations:** file-per-migration in `db/migrations/NNN-description.sql`. A small `lib/db/migrate.ts` (~30 lines) runs unapplied ones in order at the start of every `npm run ingest`. Tracked via `migrations` table. No ORM — direct SQL because the schema is small.

## Page structure & routing

### Routes

```
/                                       all-accounts dashboard
/accounts/[uuid]                        308 redirect to /accounts/[uuid]/overview
/accounts/[uuid]/overview               holdings-first standard view
/accounts/[uuid]/options                wheel-strategy overlay (existing dashboard, relocated)
/accounts/[uuid]/trades                 per-account trade history
/accounts/[uuid]/transactions           per-account transaction log
/accounts/[uuid]/_debug/twr             admin-by-convention TWR computation dump (not nav-linked)
```

Unknown UUID → Next.js `notFound()` → 404 page.

UUID is the URL identifier throughout. `external_id` and `id` never appear in URLs.

### Top-level navigation (`AppNav`)

Existing `app/components/AppNav.tsx` becomes account-aware:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Lens          [Account: Demo ▾]    Overview · Options · Trades · Tx │
└──────────────────────────────────────────────────────────────────────┘
```

- **Brand** (left) links to `/`.
- **Account picker** (center): dropdown listing all `accounts` rows; click switches to that account's `/overview`.
- **Per-page tabs** (right): four links scoped to current account. **Options tab is hidden** when the account has zero options-related transactions. Same data-driven hide for Trades if zero trades. Overview and Transactions always show.
- On `/` (no account context), picker shows "All accounts" and per-page tabs are hidden.

### What's on each page

#### `/` — all-accounts dashboard

- **Total NAV strip:** total NAV across accounts, total period change, total NAV sparkline.
- **Account grid:** card per account — label, current NAV, period change, sparkline, last-updated badge (stale when `last_seen_at` > 7d), click-through to `/accounts/[uuid]/overview`.
- **Period selector:** `?period=<1M|3M|YTD|1Y|All|custom>`, default `1M`.
- **Onboarding state** (zero accounts): existing `OnboardingCard` with copy explaining drop-CSV-and-`/ingest`.

#### `/accounts/[uuid]/overview` — holdings-first

- NAV strip (this account, with TWR for selected period).
- Top holdings table (symbol · qty · price · value · % of acct · day Δ).
- Recent transactions (last 10, with link to full log).
- Allocation chart (by `asset_type`, then by symbol within equities).

Generic — works for any account type (IRA + ETFs, brokerage + options, money market, mixed).

#### `/accounts/[uuid]/options` — wheel-strategy overlay

The existing dashboard, relocated. Components stay (`NavCard`, `CashYieldCard`, `CapitalAtRiskCard`, `OutcomesCard`, `PremiumByTickerCard`, `PremiumsCard`, `ReturnMetricsCard`, `SummaryStrip`, `MarkToMarketCard`, `OpenPositionsCard`, `TradeHistoryCard`, `AttentionBanner`); they get fed account-scoped data instead of "the only account."

#### `/accounts/[uuid]/trades` and `/accounts/[uuid]/transactions`

Existing `TradesPageClient` and `TransactionsPageClient` components, scoped by URL UUID. Filter UI within the page (date range, action type) survives.

#### `/accounts/[uuid]/_debug/twr`

Admin-by-convention page (not linked from nav). Renders the full TWR computation: every snapshot, every flow, every interval, every `r_i`, the chained product. Pasteable for side-by-side comparison with Schwab's reported numbers.

### Period selector (shared)

All NAV-strip-bearing pages have `?period=<...>` in URL search params. Defaults to `1M`. Custom uses `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Implemented once as a Server Component reading `searchParams`, reused everywhere.

### Data-fetching pattern

- All pages are **Server Components** that read directly from the DB via repos.
- No client-side data fetching. UI state (period, filters) lives in URL search params, fetched server-side.
- Yahoo-finance calls happen in Server Components, behind a per-render cache.

## Return math

**Snapshot-aligned TWR**, implemented as a pure function `lib/metrics/twr.ts`. Inputs: account_id, requested period `[from, to]`, snapshots, transactions, optional backfill. Output: `{ twr, navSeries, segments, clamped }`.

### Algorithm

**1. Resolve effective endpoints.**

- **Effective start.** If `accounts.seed_date / seed_value` set *and* requested `from` ≤ `seed_date`: `effective_start = (seed_date, seed_value)`. Otherwise: snap `from` to the earliest snapshot date ≥ requested `from`. If clamped, set `clamped = true` so UI shows a banner.
- **Effective end.** Snap to the latest snapshot date ≤ requested `to`.

**2. Identify cash flows during the period.** Only **external** flows count for TWR — internal cash motion (dividends, interest, fees, trades) is *part* of return:

| `action_canonical` | Treated as |
| --- | --- |
| `TRANSFER_IN`, `TRANSFER_OUT`, `JOURNAL` | External flow |
| `DIVIDEND`, `INTEREST`, `FEE` | Internal — *not* a flow |
| `BUY`, `SELL`, `BUY_TO_*`, `SELL_TO_*`, `ASSIGNMENT`, `EXERCISE`, `EXPIRATION` | Internal — not a flow |
| `UNKNOWN` | Not a flow (flag in summary) |

`JOURNAL` is genuinely ambiguous — Schwab uses it for both bank-side transfers and intra-Schwab moves. v1 conservative call: treat as external flow. Re-evaluate if it produces noticeably-wrong numbers.

**3. Build sub-period boundaries.** Snapshot dates inside the period, plus `effective_start_date` and `effective_end_date`. We don't have NAV on cash-flow dates that aren't snapshot dates, so flows get *time-weighted within their containing snapshot interval* (Modified Dietz at the sub-period level).

**4. Compute each sub-period's return.** For interval `[t_i, t_{i+1}]` with NAV `N_i, N_{i+1}` and flows `F_k` at dates `d_k` inside `(t_i, t_{i+1}]`:

```
flows_i        = Σ F_k
weighted_i     = Σ F_k · (t_{i+1} − d_k) / (t_{i+1} − t_i)
r_i            = (N_{i+1} − N_i − flows_i) / (N_i + weighted_i)
```

**5. Chain TWR-style.**

```
TWR = (Π(1 + r_i)) − 1
```

**6. Build NAV series for sparkline / chart.** Same snapshot points, plot raw NAV (not return). Mark cash-flow dates with annotations.

### Period selector → algorithm input

UI period (`1M`, `3M`, `YTD`, `1Y`, `All`, custom) maps to `(from, to)`. `All` = `(NULL, today)`, resolves to `(effective_start, latest_snapshot)`. Custom = explicit dates.

### Edge cases (explicit handling)

| Situation | Behavior |
| --- | --- |
| Period entirely before earliest snapshot, no backfill | Return `null` TWR. UI: "No data for this period." |
| Single snapshot in period | TWR undefined. UI: "Need ≥2 snapshots." Show NAV at point. |
| `effective_start_nav = 0` (account opened with first `TRANSFER_IN` as t₀) | Skip the first sub-period; chain begins at first snapshot after the deposit. |
| Requested `from` is between `seed_date` and earliest snapshot | Snap to earliest snapshot. Backfill seed only activates when `from ≤ seed_date` — extending the period earlier than the seed is the seed's only role. |
| Period clamped because `from` < earliest snapshot and no backfill | `clamped = true`, banner: "Earliest data: <date>. Set backfill to extend." |
| Negative effective NAV | Don't crash; surface a warning, return `null`. |

### Benchmark comparison

When `accounts.benchmark` is set:

- Compute hypothetical buy-and-hold TWR over same effective `[from, to]`: `(close_to / close_from) − 1`. No flow handling — by construction, the benchmark has no flows.
- Display alongside account TWR on `NavCard`.
- Existing `lib/market/` and `yahoo-finance2` dep stay; no schema change.

### Where TWR is used in the UI

- **`/`** — account cards and total NAV strip use TWR for selected period.
- **`/accounts/[uuid]/overview`** — NAV strip, with optional benchmark comparison.
- **`/accounts/[uuid]/options`** — existing `NavCard` / `ReturnMetricsCard` replace naive return calc with TWR.

## Validation strategy

**Validate against Schwab.** Treat any divergence between Lens TWR and Schwab's "Performance" tab as a bug until we understand the cause. Expected sources of divergence: timing of dividend/interest credit, treatment of `JOURNAL` rows, snapshot density (Schwab has daily NAV; Lens has user-export-frequency NAV). Each understood divergence gets documented in `docs/methodology.md` with a worked example. Goal: be able to point at any number on the dashboard and explain how it was computed and why it differs from Schwab.

### Inspectability requirement

Every TWR-bearing card must be inspectable. Concretely: a "ⓘ" / "How is this computed?" affordance that opens a tooltip/popover showing:

- The effective `(from_date, from_NAV)` and `(to_date, to_NAV)` used.
- Each cash flow inside the period: date, action, amount, time-weight.
- Each sub-period's return contribution.
- The chained product.

When you compare to Schwab and they diverge, you can see exactly *what we did* without reading source code.

### Hidden debug route

`/accounts/[uuid]/_debug/twr?period=<...>` — admin-only-by-convention page (no auth, just not linked from nav). Prints the entire computation: every snapshot, every flow, every interval, every `r_i`. Pasteable into a doc, easy to compare with Schwab side-by-side.

### Author's note on trust

The TWR math in `lib/metrics/twr.ts` was specified by Claude Code from textbook references; the repo author trusts it on faith pending real-world comparison against Schwab's reported numbers. Validation issues are first-class: treat any unexplained divergence as a bug, and document understood ones in `docs/methodology.md`.

## Testing strategy

Per-module, with fictional fixtures only (financial-data hygiene rule):

- **`lib/schwab/` parsers** — unit tests against hand-built CSV fixtures (`tests/fixtures/schwab/`). Cover every action enum mapping, options symbol parsing, cash rows, `Account Total` rows, edge cases (empty cells, parens-negatives, "as of" dates).
- **`lib/db/`** — in-memory SQLite. Migration runner test (clean DB → all migrations apply → schema matches expected). Repo unit tests (insert, idempotency, lookup, update).
- **`scripts/ingest.ts`** — end-to-end against an in-memory DB seeded with multiple fixture files. Asserts: account auto-discovery (UUID generated, label captured), idempotency (re-run = no-op), multi-file dedup (overlapping CSVs collapse), unmapped actions land as `UNKNOWN`.
- **`lib/metrics/twr.ts`** — hand-computed expected values for a hand-built scenario; every edge case from the return-math section gets a test; clean-account degenerate case (TWR == naive); compare against an external Modified Dietz calculator for one or two scenarios.
- **`lib/metrics/cashflow.ts`, `navSeries.ts`, `benchmark.ts`** — straightforward unit tests; benchmark module mocks yahoo-finance.
- **Integration** (`tests/integration.test.ts`) — Server Component renders a full dashboard against a seeded DB; asserts key numbers match expected.
- **Manual verification per issue** — every PR description includes a "manual test plan" checklist covering user-visible behavior. Each issue must leave a healthy, working codebase.

## v1 issue list

```
Foundation (sequential):
  1. Foundation — DB layer + Schwab parsers + ingest + DB-backed dashboard
     [the chunky one; site fully working at the end]

Expansion (mostly parallel after #1):
  2. Snapshot-aligned TWR + optional backfill (replaces existing return calc)
  3. Move current dashboard to /accounts/[uuid]/options (URL-only change)
  4. /accounts/[uuid]/overview — holdings-first standard view
  5. /accounts/[uuid]/trades and /accounts/[uuid]/transactions — relocate per-account
  6. / — all-accounts grid + total NAV strip
  7. Last-updated / stale-data indicator (folds into #6 unless surfacing it cleanly is its own design problem)
```

## Follow-up issue catalog

Each filed in the new repo, *not* implemented in v1.

**F1. Modern-dashboard layout for `/accounts/[uuid]/overview`.** Two-column layout: left = full NAV/TWR chart with period selector and key stats; right = top holdings + recent activity + allocation. Reuses v1 data sources. *Useful* once you've lived with holdings-first and learned what you actually look at. *Deferred* because the better layout should follow lived experience. **Size:** medium, splittable into chart + layout reorg.

**F2. Cross-account analytics on `/`.** Net-worth-over-time chart (sum of `market_value` across accounts grouped by `as_of`); allocation pie across all accounts; per-account contribution-to-return; concentration warnings. *Useful* — concentration warning alone justifies the work; the time-series is the most-requested chart in any portfolio tool. *Deferred* because the grid+strip already covers headline-level "how am I doing overall." **Size:** medium, ~2–3 issues.

**F3. List-only `/` view (filed for the record).** Bare table of accounts with NAV instead of grid. *Almost certainly not useful* — the grid is more scannable and click-through is fast. Filed so we have a record of having considered "less is more" and chosen against it. **Size:** trivial if ever revived.

**F4. Global `/transactions` firehose.** Cross-account transaction log, sortable, filterable, exportable to CSV. New page `/transactions`; reuses `TransactionLogCard` without account filter; adds an "Account" column. *Useful* for tax-time review, hunting for one transaction across accounts, sanity-checking unmapped `UNKNOWN` actions. *Deferred* because per-account views handle 90% of use. **Size:** small.

**F5. Auto-reconstruct historical NAV from transactions + yahoo-finance.** For equity-only accounts (no options), walk forward from earliest transaction tracking holdings; pull historical close prices to reconstruct daily NAV. Eliminates the need for `account:configure --seed-*` for those accounts. *Useful* — most accounts are likely equity-only and this auto-magically extends history without manual input. *Deferred* because it doesn't help options-heavy accounts (yahoo lacks per-contract option prices), and the only currently-tracked account is options-heavy. **Size:** large, ~2 issues (reconstruction core + UI integration with auto-detection banner).

**F6. Methodology document `docs/methodology.md`.** Markdown explainer of TWR / MWR / Modified Dietz, with worked examples and known-divergence-from-Schwab cases. *Useful* as the canonical reference; defensible math; helps re-derive when something looks off. *Deferred* because it's organic — write as we hit divergences. **Size:** small, ongoing.

**F7. `/accounts/[uuid]/performance` overlay.** Power-user view: TWR, MWR (IRR), Modified Dietz side-by-side; period selector; drill-into each computation; benchmark comparison with rolling-window analysis. *Useful* for "how am I *really* doing." *Deferred* because the v1 NAV strip already shows headline TWR. **Size:** large — needs MWR/IRR solver, new UI, all wired to existing data.

**F8. Schwab-vs-Lens comparison harness.** Tool to make "validate against Schwab" cheap to run repeatedly. Either a UI feature where you paste Schwab's numbers and Lens shows side-by-side with divergence highlighted, or an admin-only page that prints Lens's full TWR computation in a copy-pasteable format. *Useful* every time we touch the math. *Deferred* until we know what manual comparison feels like in practice using just `_debug/twr`. **Size:** small-to-medium.

## Public repo migration plan

Executed after implementation plan(s) are written, before any v1 code work begins. Until step 3 completes, the repo stays at the existing private remote (`schwab-lens`).

### 1. Scrub-and-rebrand operation

`git filter-repo` rewrites history with PII stripped and product renamed. Operations:

- Find/replace across every commit:
  - Real masked Schwab account ID → `XXX###` placeholder.
  - Real seed date + value pair → fictional placeholder pair (e.g., `2026-01-15` / `12345`).
  - Real Schwab account nickname → `Demo` (in fixtures and hardcoded references); `<Nickname>` (in template/example strings).
  - Repo / package name (`schwab-lens`) → `schwab-lens`.
- After `filter-repo`, a final rebrand commit on top:
  - New `README.md` (replaces create-next-app default; introduces Schwab Lens).
  - Updated `CLAUDE.md` (Schwab Lens product description; wheel-strategy guidance scoped to `/options` overlay).
  - Rename `.claude/skills/ingest/` → `.claude/skills/ingest/`.
  - `package.json` `name` field updated.

Exact rule list and substitution script written and reviewed before running. Old remote remains intact until verified clean.

### 2. Push to new remote

- `git remote add origin git@github.com:jayrav13/schwab-lens.git`
- `git push -u origin main`
- Verify clean clone shows no PII via grep.

### 3. Deprecate old remote

- Delete `schwab-lens` repo from GitHub.
- From this point forward, the repo is public.

### 4. Bootstrap the new repo

- File v1 issue list (#1–#7).
- File follow-up catalog (F1–F8).
- Add CI: `npm run lint`, `npm run typecheck`, `npm run test` on PR + main.
- Add `CONTRIBUTING.md`: financial-data hygiene rule, fictional-fixture-only requirement, branch / PR / commit conventions, per-issue manual-test-plan requirement.
- Add issue and PR templates with manual-test-plan checklist.

### 5. Ship issue #1

Implementation begins.
