# Positions CSV Ingestion — Design

**Date:** 2026-04-22
**Status:** Draft — awaiting review

## Problem

The app currently bootstraps from a hardcoded `seedDate` / `seedValue` in `config.ts` and replays a single Transactions CSV to derive NAV, open positions, and cash. This has three weaknesses:

1. **Seed fragility.** If the configured seed value is off, or if any transaction pre-seed is missing, NAV is silently wrong for all time.
2. **Single-file loader.** Only the newest CSV is read. Every new download either overwrites the prior file or is ignored.
3. **External marks required.** Open share positions are marked via yfinance; open *option* contracts aren't marked at all, so the portfolio value doesn't reflect option P&L until assignment/close.

Schwab's Positions CSV (separate from the Transactions CSV) provides a point-in-time ground-truth snapshot: cash, open share lots with cost basis, open option contracts with live marks, and a portfolio total. Integrating it solves all three problems if done carefully.

## Goals

- Drop any combination of Transactions and Positions CSVs into `data/` over time; the app re-derives the correct state on each reload.
- Eliminate the hardcoded seed in favor of the earliest Positions snapshot.
- Use Schwab's own prices (from the latest Positions snapshot) for current cash, share marks, and option marks — avoiding external market-data calls where possible.
- Ingest from `~/Downloads` into the repo via a one-line Claude skill.

## Non-goals (v1)

- Using Positions snapshots as NAV anchor points *across* the historical series (deferred).
- Reconciliation UI surfacing drift between derived NAV and snapshot NAV.
- Handling unexpected Schwab CSV column changes — parser throws on schema drift rather than guessing.

## Design summary

- **Two subdirectories** inside `data/`: `data/transactions/` and `data/positions/`.
- **Multi-file loader** reads every CSV in each subdirectory, parses, unions, and deduplicates.
- **Approach 2 seed semantics** (from brainstorming): earliest Positions snapshot becomes the seed; transactions before that date are dropped as pre-seed noise.
- **Latest Positions snapshot** overrides current cash, current share lots, and current option marks in the dashboard view.
- **Mark-to-market prefers snapshot prices** over yfinance when a snapshot covers the symbol; yfinance fills gaps only.
- **`/ingest` skill** moves `~/Downloads/Demo*.csv` files into the correct subdirectory.

## File layout & naming

```
data/
├── transactions/
│   └── Demo_<acct>_Transactions_YYYYMMDD-HHMMSS.csv
└── positions/
    └── Demo-Positions-YYYY-MM-DD-HHMMSS.csv
```

Schwab's export filenames already include a timestamp. Users do not rename files.

`data/` and both subdirectories remain gitignored. The ingest skill creates the subdirectories if missing.

## Ordering by filename timestamp

- **Transactions:** parse `YYYYMMDD-HHMMSS` from the filename tail. Used only for operator visibility; transaction rows are themselves sorted by the `Date` column.
- **Positions:** parse `YYYY-MM-DD-HHMMSS` from the filename tail. This establishes the snapshot order *before* parsing any file. The header line inside the file (`"Positions for account ... as of HH:MM PM ET, YYYY/MM/DD"`) is also parsed and the two timestamps must agree within one minute; mismatch throws.

## Loader behavior

### Transactions

1. Glob every file matching `data/transactions/*.csv`.
2. Parse each through the existing transactions parser.
3. Union all rows; deduplicate by the tuple `(date, action, symbol, quantity, amount)`.
4. Sort by date ascending.

**Rationale for dedup key:** Schwab exports frequently overlap (e.g., each export covers the last 90 days). Treating two rows with identical `(date, action, symbol, quantity, amount)` as the same logical event is a convention; genuine collisions (two separate events matching on all five fields) are rare enough to accept in v1. If they become a problem in practice, upgrade the key to include a Schwab transaction ID if one is exposed in the CSV.

### Positions

1. Glob every file matching `data/positions/*.csv`.
2. Parse each into a `PositionsSnapshot`.
3. Sort by `asOf` ascending.
4. Expose `earliest` and `latest` helpers.

## `PositionsSnapshot` shape

```ts
type PositionsSnapshot = {
  asOf: Date;                 // parsed from the file header, validated against filename
  cash: number;               // from the "Cash & Cash Investments" row, Mkt Val column
  totalValue: number;         // from the "Positions Total" row, Mkt Val column
  shares: SnapshotShare[];
  options: SnapshotOption[];
};

type SnapshotShare = {
  ticker: string;
  quantity: number;
  price: number;              // Schwab's last price at asOf
  marketValue: number;
  costBasis: number;
};

type SnapshotOption = {
  underlying: string;
  expiry: string;             // YYYY-MM-DD
  strike: number;
  callPut: "C" | "P";
  quantity: number;           // negative = short
  price: number;              // Schwab's mark at asOf
  marketValue: number;
  delta: number | null;
  theta: number | null;
  intrinsicValue: number | null;
};
```

## Positions CSV parsing details

The Schwab Positions CSV has several quirks the parser handles explicitly:

- **Line 1:** header string `"Positions for account ... as of HH:MM PM ET, YYYY/MM/DD"`. Parsed for `asOf`.
- **Line 2:** column headers.
- **Data rows:** one per position. `Asset Type` column disambiguates `Equity` vs `Option` vs `Cash and Money Market`.
- **Cash row:** `Symbol = "Cash & Cash Investments"`, most columns are `"--"`, `Mkt Val` is the cash balance.
- **Total row:** `Symbol = "Positions Total"`, `Mkt Val` is the snapshot's total portfolio value.
- **Option symbol format:** `TICKER MM/DD/YYYY STRIKE C|P` (e.g., `CLSK 05/08/2026 12.00 C`). Parsed into `{underlying, expiry, strike, callPut}`.
- **Money columns:** `$` and commas are stripped; a leading `-$` parses as negative.
- **Schema drift:** if the column header row does not match the expected set exactly, throw with a clear message naming the unexpected column.

## Seed semantics (Approach 2)

- If `positions/` contains ≥1 snapshot: seed is `earliestSnapshot`. `seedDate = earliestSnapshot.asOf` (truncated to the date), `seedValue = earliestSnapshot.totalValue`. The open lots/contracts inside that snapshot become the portfolio builder's *initial state* — the builder no longer tries to derive starting-state positions from pre-seed transactions. Transactions with `date < seedDate` are dropped before replay.
- If `positions/` is empty: fall back to `config.seedDate` / `config.seedValue` (current behavior). This keeps the app bootable before the first Positions drop.
- `config.seedDate` / `config.seedValue` remain in the schema as fallback; they are not removed.

## "As of now" anchor (from the latest snapshot)

When a Positions snapshot exists, the dashboard "today" view uses snapshot values in place of derived values:

| Value | Source when snapshot exists | Source when no snapshot |
|---|---|---|
| Current cash | `latestSnapshot.cash` | Seed + sum of transaction cash deltas |
| Open share lots | `latestSnapshot.shares` | Derived from transactions |
| Open option contracts | `latestSnapshot.options` | Derived from transactions |
| Current NAV point | `latestSnapshot.totalValue` | Derived |

The historical NAV *series* (line chart) is still computed from seed + transactions. Its final point is pinned to `latestSnapshot.totalValue` rather than the derived value. Small drift between the derived endpoint and the snapshot is expected (dividends, interest, fees Schwab rolls up differently) and is not surfaced in v1.

## Mark-to-market changes

Current: `lib/market/*` calls yfinance for every open share ticker. Options are not marked.

New policy:

- **If a latest snapshot exists:**
  - Share marks come from `snapshot.shares[i].price`.
  - Option marks come from `snapshot.options[i].price`.
  - yfinance is called only for tickers present in derived positions but missing from the snapshot (e.g., a share position opened *after* the latest snapshot).
- **If no snapshot exists:** behavior matches today (yfinance for shares, no option marking).

Freshness: a snapshot is used regardless of age. Stale prices are acceptable because the user controls refresh by re-dropping an export.

## Ingest skill (`/ingest`)

Location: `~/.claude/skills/ingest/SKILL.md` (user-level, not repo-scoped).

Contents (sketch):

```markdown
---
name: ingest
description: Move Schwab Demo CSVs from ~/Downloads into the schwab-lens repo data/ subdirs
---

Run these commands to move any Demo Transactions or Positions CSVs from the user's
Downloads folder into the correct data subdirectory of the schwab-lens repo. Use `mv -n`
(no-clobber) so re-running is safe. Report what moved.

Target repo: ~/Code/schwab-lens

1. `mkdir -p ~/Code/schwab-lens/data/transactions ~/Code/schwab-lens/data/positions`
2. Move `~/Downloads/Demo*Transactions*.csv` → `data/transactions/` with `mv -n`
3. Move `~/Downloads/Demo*Positions*.csv` → `data/positions/` with `mv -n`
4. List what was moved (and what was skipped due to no-clobber).
```

Invocation: `/ingest` in Claude Code, or natural language ("ingest my schwab-lens downloads").

The skill is intentionally simple: no deduplication logic, no validation — those live in the loader. The skill's only job is "put the files in the right place."

## Tests

Fixtures (fully fictional, per `CLAUDE.md` hygiene rule):

- `tests/fixtures/positions/positions-basic.csv` — one share lot, one short call, one short put, cash row, total row.
- `tests/fixtures/positions/positions-missing-cash.csv` — edge case, parser should throw clearly.
- `tests/fixtures/positions/positions-day-1.csv`, `positions-day-2.csv` — two snapshots, exercises sorting + earliest/latest selection.
- `tests/fixtures/transactions/transactions-overlap-a.csv`, `transactions-overlap-b.csv` — overlapping exports for dedup test.

Test cases:

- Positions parser: basic parsing, option symbol parsing, money parsing, schema-drift detection, filename/header timestamp agreement.
- Loader: multi-file transactions union + dedup; multi-file positions sorted by `asOf`; earliest/latest selection.
- Portfolio integration: with ≥1 snapshot, seed comes from earliest; pre-seed transactions are dropped; current cash / lots / contracts come from latest.
- Mark-to-market: snapshot prices preferred; yfinance fallback only for symbols missing from snapshot; no-snapshot fallback matches current behavior.

## Failure modes & errors

- **Schwab schema change** (unexpected column header) → parser throws, naming the unexpected column.
- **Filename and header `asOf` disagree by >1 minute** → throws, names both timestamps.
- **Positions file missing cash row or total row** → throws, names the missing row.
- **Multiple Positions files with identical `asOf`** → throw on load (ambiguous).
- **Empty `data/transactions/` and empty `data/positions/`** → same as today: seed from config, empty transaction list.

All loader errors surface in the dashboard's existing error panel.

## Rollout

1. Implement Positions parser + loader changes (with fixtures and tests).
2. Extend transactions loader to read all files + dedup.
3. Integrate into portfolio builder: seed from earliest snapshot when present, override "now" state from latest snapshot.
4. Update mark-to-market to prefer snapshot prices, yfinance fallback only.
5. Write the `/ingest` skill at `~/.claude/skills/ingest/SKILL.md`.
6. Manual end-to-end smoke test with a real Transactions + Positions pair.

`data/` is already gitignored, so subdirectories under it inherit that — no `.gitignore` change needed.

## Open questions

None at draft time. Review will surface any.
