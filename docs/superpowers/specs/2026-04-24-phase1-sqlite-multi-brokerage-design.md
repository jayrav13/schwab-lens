# Phase 1: SQLite foundation + multi-brokerage ingest

**Status:** Spec — pending implementation
**Tracking issue:** [#15](https://github.com/jayrav13/schwab-lens/issues/15)
**Roadmap context:** Phase 2 = [#16](https://github.com/jayrav13/schwab-lens/issues/16) (per-account user models & projections); Phase 3 = [#17](https://github.com/jayrav13/schwab-lens/issues/17) (grouping UI + freedom-date). Adapter follow-ups: [#18 Robinhood](https://github.com/jayrav13/schwab-lens/issues/18), [#19 Chase](https://github.com/jayrav13/schwab-lens/issues/19), [#20 Fidelity](https://github.com/jayrav13/schwab-lens/issues/20).

## Goal

Migrate from the current stateless "parse newest CSV per request" model to a SQLite-backed data layer with a generic multi-brokerage / multi-account schema. The `data/<brokerage>/<account>/` CSVs remain the immutable source of truth; the DB is a derived, queryable projection that also holds user models in later phases.

This is the foundation for everything else on the roadmap. The `portfolio.db` file also becomes the shareable artifact for non-technical Claude Code users — drop it in a folder, ask Claude questions about it, get answers via SQL the user never sees.

## Non-goals (Phase 1)

- Per-account editable metadata (growth rates, targets, groups, labels) — Phase 2.
- Projections / freedom-date math — Phase 2.
- Multi-account UI, account picker, grouping, blending — Phase 3.
- Non-Schwab brokerage adapters — separate tracking issues; the adapter *interface* is established here, but only Schwab is implemented.
- Caching of derived series in the DB — compute on read; revisit if/when slow.

## Architecture

```
┌─────────────────┐  /ingest skill     ┌───────────────────────┐
│  ~/Downloads    │ ─────────────────▶ │ data/<brokerage>/     │
│  *.csv exports  │  routes files      │ <external_id>/        │
└─────────────────┘                    │   transactions/*.csv  │
                                       │   positions/*.csv     │
                                       └──────────┬────────────┘
                                                  │ npm run ingest
                                                  │ (idempotent)
                                                  ▼
                                       ┌───────────────────────┐
                                       │ lib/brokerage/        │
                                       │   schwab/  (Phase 1)  │
                                       │   robinhood/  (#18)   │
                                       │   chase/      (#19)   │
                                       │   fidelity/   (#20)   │
                                       └──────────┬────────────┘
                                                  │ canonical rows
                                                  ▼
                                       ┌───────────────────────┐
                                       │  data/portfolio.db    │
                                       │  (SQLite)             │
                                       └──────────┬────────────┘
                                                  │ reads
                                                  ▼
                                       ┌───────────────────────┐
                                       │ Next.js dashboard     │
                                       │ (Demo-only render   │
                                       │  in Phase 1)          │
                                       └───────────────────────┘
```

### Key principles

- **CSVs are the source of truth.** The DB is throwaway — delete `portfolio.db`, re-run ingest, and you are back to the same state.
- **Adapters are the only brokerage-aware code.** Everything downstream sees canonical rows.
- **Ingest is lossless.** Every CSV row lands as a DB row with a `raw` JSON column holding the original. Canonical fields are best-effort extractions; future canonical fields can be re-derived from `raw` without re-ingesting.
- **Ingest is idempotent.** Re-running against the same `data/` is a no-op via per-row content hashes and `INSERT OR IGNORE`.
- **Phase 1 ships only Schwab.** The adapter interface is documented and Robinhood/Chase/Fidelity become straightforward follow-ups.

### Folder layout

```
data/                                      # gitignored
  portfolio.db                             # SQLite DB
  schwab/
    520/
      transactions/Demo_XXX###_Transactions_*.csv
      positions/Demo-Positions-*.csv
  robinhood/<external_id>/...              # future
  chase/<external_id>/...                  # future
  fidelity/<external_id>/...               # future
```

The brokerage-specific path segment is authoritative for *which* brokerage; the file content is authoritative for *which* account (re-verified at ingest time, mismatches logged).

## Schema

Six tables, one initial migration. All small.

```sql
-- brokerages: enum-as-table; seeded by initial migration
CREATE TABLE brokerages (
  slug         TEXT PRIMARY KEY,         -- 'schwab', 'robinhood', 'chase', 'fidelity'
  display_name TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

-- accounts: one row per (brokerage, external_id)
CREATE TABLE accounts (
  id             INTEGER PRIMARY KEY,
  brokerage_slug TEXT NOT NULL REFERENCES brokerages(slug),
  external_id    TEXT NOT NULL,           -- Schwab: '520'
  label          TEXT NOT NULL,           -- 'Demo' (Phase 2 makes this user-editable)
  seed_date      TEXT,                    -- starting point for return calcs (nullable)
  seed_value     REAL,                    -- starting NAV for return calcs (nullable)
  benchmark      TEXT,                    -- e.g., 'SPY' (nullable)
  first_seen_at  TEXT NOT NULL,
  last_seen_at   TEXT NOT NULL,
  UNIQUE(brokerage_slug, external_id)
);

-- transactions: one row per CSV row, idempotent via content_hash
CREATE TABLE transactions (
  id               INTEGER PRIMARY KEY,
  account_id       INTEGER NOT NULL REFERENCES accounts(id),
  trade_date       TEXT NOT NULL,         -- YYYY-MM-DD
  action_canonical TEXT NOT NULL,         -- enum (below); UNKNOWN is legal
  action_raw       TEXT NOT NULL,         -- e.g., 'Sell to Open'
  symbol           TEXT,
  description      TEXT,
  quantity         REAL,
  price            REAL,
  fees             REAL,
  amount           REAL NOT NULL,         -- signed cash impact (+ inflow, - outflow)
  raw              TEXT NOT NULL,         -- JSON of original row
  source_file      TEXT NOT NULL,
  content_hash     TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_tx_account_date   ON transactions(account_id, trade_date);
CREATE INDEX idx_tx_account_action ON transactions(account_id, action_canonical);

-- position_snapshots: one row per (account, as_of, symbol) — history retained
CREATE TABLE position_snapshots (
  id           INTEGER PRIMARY KEY,
  account_id   INTEGER NOT NULL REFERENCES accounts(id),
  as_of        TEXT NOT NULL,             -- YYYY-MM-DD parsed from CSV header
  symbol       TEXT NOT NULL,
  description  TEXT,
  quantity     REAL,
  price        REAL,
  market_value REAL,
  cost_basis   REAL,
  asset_type   TEXT,                      -- 'equity' | 'option' | 'cash'
  raw          TEXT NOT NULL,
  source_file  TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_pos_account_asof   ON position_snapshots(account_id, as_of);
CREATE INDEX idx_pos_account_symbol ON position_snapshots(account_id, symbol, as_of);

-- settings: global key/value (replaces config.json)
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

### Canonical action enum

Starter set; extends as adapters encounter new types.

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

`content_hash` is `SHA-256({brokerage_slug, external_id, normalized_canonical_row})`. "Normalized" = trimmed whitespace, consistent numeric formatting. Re-exports producing the same row produce the same hash → `INSERT OR IGNORE` makes ingest a no-op. Position snapshots use day-granularity `as_of`; same-day re-exports collapse (first wins).

### Settings keys (Phase 1)

| Key | Value | Purpose |
| --- | --- | --- |
| `dashboard.primary_account` | `<brokerage_slug>:<external_id>` (e.g., `schwab:520`) | Which account the dashboard renders |
| `market_data.enabled` | `'true'` / `'false'` | Global feature flag (replaces `config.json.marketData.enabled`) |

## Brokerage adapters

```
lib/brokerage/
  types.ts              # Brokerage interface + canonical row shapes
  registry.ts           # exported list of adapters + filename routing
  schwab/
    index.ts            # exports the Brokerage object
    filenames.ts        # regex patterns for Transactions / Positions
    identify.ts         # extract external_id + label from a file
    transactions.ts     # CSV → CanonicalTransaction[]
    positions.ts        # CSV → CanonicalPositionSnapshot[]
    actions.ts          # Schwab action string → canonical enum
```

### Adapter interface

```ts
export interface Brokerage {
  slug: string;                      // 'schwab'
  displayName: string;               // 'Charles Schwab'
  filenamePatterns: {
    transactions: RegExp[];
    positions: RegExp[];
  };
  identify(input: ParseInput): { externalId: string; label: string };
  parseTransactions(input: ParseInput): CanonicalTransaction[];
  parsePositions(input: ParseInput): CanonicalPositionSnapshot[];
}

interface ParseInput { filepath: string; content: string; }

interface CanonicalTransaction {
  tradeDate: string;                 // YYYY-MM-DD
  actionCanonical: CanonicalAction;
  actionRaw: string;
  symbol: string | null;
  description: string | null;
  quantity: number | null;
  price: number | null;
  fees: number | null;
  amount: number;                    // signed
  raw: Record<string, unknown>;
}

interface CanonicalPositionSnapshot {
  asOf: string;                      // YYYY-MM-DD
  symbol: string;
  description: string | null;
  quantity: number | null;
  price: number | null;
  marketValue: number | null;
  costBasis: number | null;
  assetType: 'equity' | 'option' | 'cash' | null;
  raw: Record<string, unknown>;
}
```

### Registry

```ts
// lib/brokerage/registry.ts
import { schwab } from './schwab';
export const brokerages: Brokerage[] = [schwab];

export function routeFile(filename: string):
  | { brokerage: Brokerage; kind: 'transactions' | 'positions' }
  | null;
```

### Schwab adapter specifics

**Filename patterns** (from real exports):
- Transactions: `/^.+_XXX\d{3}_Transactions_\d{8}-\d{6}\.csv$/`
- Positions: `/^.+-Positions-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/`

**Identity extraction:**
- Transactions filename: capture `XXX(\d{3})` → `externalId`; nickname before `_XXX` → `label`.
- Positions content: first line is `Positions for account <Label> ...<digits> as of ...` — same fields, different source. Both must agree; mismatch logs a warning.

**As-of date for Positions:** parsed from the first line (`... as of 07:08 AM ET, 2026/04/24`), normalized to `YYYY-MM-DD`.

**Initial action mapping** (extend as new types are encountered; unmapped → `UNKNOWN`):

```
'Buy'                 → BUY
'Sell'                → SELL
'Buy to Open'         → BUY_TO_OPEN
'Sell to Open'        → SELL_TO_OPEN
'Buy to Close'        → BUY_TO_CLOSE
'Sell to Close'       → SELL_TO_CLOSE
'Assigned'            → ASSIGNMENT
'Exercised'           → EXERCISE
'Expired'             → EXPIRATION
'Qualified Dividend'  → DIVIDEND
'Bank Interest'       → INTEREST
'Credit Interest'     → INTEREST
'Journal'             → JOURNAL
'MoneyLink Deposit'   → TRANSFER_IN
'MoneyLink Transfer'  → TRANSFER_IN / TRANSFER_OUT (sign-based)
'Wire Sent'           → TRANSFER_OUT
'Fee'                 → FEE
```

**Refactor note:** the existing `lib/csv/` and `lib/positions/` parsing logic becomes the guts of `lib/brokerage/schwab/`. This is a relocation + generalization, not a rewrite — the parsing behavior is already correct and tested.

## Ingest flow

Two artifacts, one underlying code path. Both idempotent.

### `/ingest` skill (replaces `/ingest`)

```
1. For each file in ~/Downloads:
     - Try every registered brokerage's filenamePatterns
     - On match: read file content, call adapter.identify() → {externalId, label}
     - mkdir -p data/<brokerage_slug>/<externalId>/<kind>/
     - mv -n into target directory

2. Run `npm run ingest`

3. Report:
     - Files routed (and where)
     - New accounts discovered
     - Rows inserted / skipped-duplicate
     - Files in ~/Downloads that matched no brokerage pattern (left in place)
     - Unmapped action types with counts
```

### `npm run ingest` (the real logic)

Runnable independently. No arguments.

```
1. Run any unapplied migrations.

2. Walk data/*/*/transactions/*.csv and data/*/*/positions/*.csv.

3. For each file:
     a. Resolve brokerage from path → adapter
     b. Read + parse → canonical rows
     c. Upsert account: ON CONFLICT(brokerage_slug, external_id) DO UPDATE SET label, last_seen_at
        On INSERT (new account): auto-populate seed_date / seed_value (see Seed Semantics)
     d. INSERT OR IGNORE each canonical row (UNIQUE(content_hash) handles dedup)

4. Print summary: files processed, rows inserted/skipped, accounts touched,
   unmapped action counts.
```

### Error handling

| Failure | Behavior |
| --- | --- |
| Single row fails to parse | Log row index + raw, continue with rest of file |
| Whole file fails to parse | Log + skip file, continue ingest |
| Path-vs-content brokerage mismatch | Log warning, skip file |
| `external_id` collision (two distinct labels claiming same masked ID) | Log warning, keep most recently seen label |
| Database error | Fail fast (it's a bug, not a data problem) |

### Files in `~/Downloads` that match no pattern

Left in place. The skill reports them so the user knows which files were not consumed (avoids silent dumping-ground behavior).

## Seed semantics

Every account ends up with `seed_date` and `seed_value` populated one of three ways:

1. **Manual override** (Phase 1: via `npm run account:configure`; Phase 2: editable metadata UI). Wins over auto-derive.
2. **Auto-derived on first ingest of a new account.** When ingest first creates an account row, it computes:
   - `seed_date` = earliest `position_snapshots.as_of` for that account
   - `seed_value` = `SUM(market_value)` on that snapshot
   - Means: *"tracking starts the first day I have a Positions snapshot."*
3. **Null** (only transient, before any positions are ingested). Dashboard renders an onboarding state for accounts in this state.

For your 8 accounts after Phase 1 ingest:
- **Demo**: seed set via `npm run account:configure` → `2026-01-15 / $25,000`
- **Other 7**: auto-populated from earliest Positions snapshot

The other 7 are not visible in the dashboard in Phase 1 (UI scope = no change), but their seeds are in place and ready for Phase 2 rendering.

## Admin command: `npm run account:configure`

Replaces `data/config.json` entirely. One command, run once after first ingest:

```bash
npm run account:configure -- \
  --account=schwab:520 \
  --primary \
  --seed-date=2026-01-15 \
  --seed-value=12345 \
  --benchmark=SPY
```

Flags:

| Flag | Effect |
| --- | --- |
| `--account=<brokerage>:<external_id>` | Required. Targets the account row. |
| `--primary` | Sets `settings.dashboard.primary_account = <brokerage>:<external_id>` |
| `--seed-date=YYYY-MM-DD` | Updates `accounts.seed_date` |
| `--seed-value=<number>` | Updates `accounts.seed_value` |
| `--benchmark=<ticker>` | Updates `accounts.benchmark` |
| `--label=<text>` | Updates `accounts.label` |

A separate setting flag (`--market-data on|off`) toggles `settings.market_data.enabled`.

After Phase 2 ships the editable-metadata UI, this command can be deprecated, but keeping it indefinitely as a CLI escape hatch costs nothing.

## Dashboard integration

The discipline: **`PortfolioState` shape stays identical. Metric code and React components are not touched.** Only `lib/server/dashboard.ts` and the persistence layer change.

### What changes

| Before | After |
| --- | --- |
| Read `data/config.json` | Read `settings` table for `dashboard.primary_account` and `market_data.enabled` |
| Load newest Transactions CSV | `SELECT * FROM transactions WHERE account_id = ? ORDER BY trade_date` |
| Load newest Positions CSV | Latest snapshot: `SELECT * FROM position_snapshots WHERE account_id = ? AND as_of = (SELECT MAX(as_of) FROM position_snapshots WHERE account_id = ?)` |
| Build `PortfolioState` | Same — same shape, same downstream code |
| Fetch benchmark via yahoo-finance2 | Unchanged |

### Files affected

| File | Disposition |
| --- | --- |
| `lib/server/dashboard.ts` | Modify: swap CSV branch for DB branch |
| `lib/csv/parse.ts`, `lib/csv/types.ts`, `lib/positions/parse.ts`, `lib/positions/types.ts` | Relocate brokerage-specific parsing logic into `lib/brokerage/schwab/` |
| `lib/csv/load.ts`, `lib/positions/load.ts` | Delete (filesystem CSV reading replaced by DB queries) |
| `lib/positions/seed.ts` | Adapt: `chooseSeed` now takes `{seedDate, seedValue}` from the account row instead of a `Config` object. The snapshot-vs-override decision logic stays. |
| `lib/config.ts` | Delete (replaced by reads from `settings` and `accounts`) |
| `lib/model/types.ts` | Modify: drop `Config` type; `Seed` and `PortfolioState` shapes unchanged |
| `lib/model/portfolio.ts`, `lib/model/cash.ts`, `lib/model/chart.ts`, `lib/model/metrics/*` | Unchanged |
| `app/components/*`, `app/page.tsx`, `app/trades/`, `app/transactions/` | Unchanged |
| `app/components/OnboardingCard.tsx` | Update copy: instead of "create config.json", "run `npm run account:configure --primary` after ingest" |

## SQLite library and migrations

- **Library:** `better-sqlite3` (sync, fastest Node SQLite binding, zero-config). Slots into Server Components naturally.
- **Migrations:** file-per-migration in `db/migrations/NNN-description.sql`. A small `lib/db/migrate.ts` (~30 lines) runs all unapplied ones in order at the start of every `npm run ingest`. Tracked via the `migrations` table. No ORM. Direct SQL because the schema is small and we want it readable.

```
db/
  migrations/
    001-initial-schema.sql
  schema.sql                # snapshot of current schema (regenerated for reference)
```

### Caching

None in Phase 1. `better-sqlite3` against a small DB is microseconds-fast; per-render queries are fine. Revisit if Phase 2/3 adds expensive query patterns.

## Testing strategy

- **Adapter parsers:** unit tests with hand-built fixtures under `tests/fixtures/<brokerage>/`. Fictional data only (CLAUDE.md hygiene rule).
- **Migration runner:** test that creates an in-memory DB, runs migrations from scratch, asserts schema and seeded `brokerages` rows.
- **Ingest:** test that creates an in-memory DB, runs the ingest pipeline against test fixtures, asserts:
  - Account row created with correct identity + auto-derived seed
  - Transactions and position snapshots inserted
  - Re-running ingest is a no-op (counts unchanged)
  - Unknown action types land as `UNKNOWN` with `raw` preserved
- **Integration (`tests/integration.test.ts`):** adapt to use a DB-backed dashboard fixture. The `PortfolioState` assertions stay the same — that is the contract preserved across the refactor.
- **Admin command:** test that flags update the right rows, malformed inputs reject cleanly.

## Implementation phasing within Phase 1

A possible sequence for the implementation plan (writing-plans skill will produce the real plan):

1. Add `better-sqlite3` dependency and `lib/db/` (connection helper + migration runner).
2. Author `db/migrations/001-initial-schema.sql`.
3. Build `lib/brokerage/types.ts` + `lib/brokerage/registry.ts`.
4. Relocate Schwab parsing into `lib/brokerage/schwab/`.
5. Build `npm run ingest` script (parses → inserts via adapters).
6. Build `/ingest` skill (or update `/ingest` to new behavior).
7. Build `npm run account:configure` admin command.
8. Migrate `lib/server/dashboard.ts` to read from DB.
9. Delete `lib/config.ts` and `data/config.json` (after the user has run `account:configure`).
10. Update `OnboardingCard` copy.
11. Adapt `tests/integration.test.ts`.

## Open questions / decisions deferred to implementation

- Exact JSON canonicalization for `content_hash` (sorted keys, number formatting). The implementation plan should pick a deterministic library or hand-roll a tiny utility.
- Exact Schwab amount-string parsing for negatives / parens / empty cells. Likely already correct in existing `lib/csv/parse.ts`; carry forward.
- How to express the Schwab-specific "fees" column (separate column vs. folded into `amount`). Existing code preserves it separately; keep the same.
- Whether to seed an in-memory DB for local `next dev` or fail-loudly when `portfolio.db` is missing. Prefer the latter — onboarding state already handles "no data yet."
