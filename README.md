# Schwab Lens

A local-first dashboard for your Schwab accounts. **Your data never leaves your machine.**

Drop your Schwab CSV exports into `data/`, run `npm run ingest`, and visit `http://localhost:3000` to see your account performance — net worth over time, top holdings, recent activity, and (for accounts with options trades) a dedicated wheel-strategy lens with capital-at-risk, premium captured, outcomes, and more.

## Why

Schwab's own performance reporting is limited. This tool reads the same CSVs you can export from Schwab and renders dashboards that are richer and more flexible than what Schwab gives you out of the box. Read-only by design — Schwab Lens does not place trades. It just helps you understand the trades you already have.

## Status

Early development. The v1 implementation roadmap is captured in `docs/superpowers/specs/2026-04-27-schwab-lens-design.md`; per-issue implementation plans live in `docs/superpowers/plans/`. Issues #1–#7 are open; the foundation issue (#1) is in progress.

## Getting started

Prerequisites: Node 20+ and npm.

```bash
git clone https://github.com/jayrav13/schwab-lens.git
cd schwab-lens
npm install
```

### Ingest your data

1. From Schwab, export Transactions and Positions CSVs **per account** (multi-account export is not used by this tool).
2. Place the CSVs in `data/transactions/` and `data/positions/`. Or, if you use Claude Code, run the `/ingest` skill to move files from `~/Downloads` and run ingest in one step.
3. Run `npm run ingest`.
4. Run `npm run dev` and visit `http://localhost:3000`.

### Optional — set a backfill seed

If you want returns to extend earlier than your earliest exported Positions snapshot for a given account, set a backfill seed:

```bash
npm run account:configure -- \
  --account=<external_id> \
  --seed-date=YYYY-MM-DD \
  --seed-value=<number> \
  --benchmark=SPY
```

Available after issue #2 ships.

## How it works

- **CSVs are the source of truth.** Schwab Lens stores nothing externally and makes no network calls except to fetch benchmark prices (yahoo-finance2). The benchmark fetch is opt-out via the `market_data.enabled` setting.
- **Idempotent ingest.** `npm run ingest` walks `data/`, parses every Schwab CSV via `lib/schwab/`, and inserts canonical rows into `data/portfolio.db` (SQLite). Re-running with the same files is a no-op.
- **Multi-account from the schema up.** Each account discovered from a CSV gets a stable URL identifier (UUID) and renders through the same set of "lenses": a generic *overview*, plus an *options* lens for accounts that trade options.
- **Dashboard reads from the DB.** `lib/server/dashboard.ts` and the React components consume DB-shaped data, not CSVs directly.

## Architecture

```
data/                  ← gitignored; CSVs and portfolio.db live here

lib/db/                ← SQLite connection, migrations, repos
lib/schwab/            ← Schwab CSV parsing
lib/metrics/           ← TWR (snapshot-aligned), holdings, allocation, benchmark
lib/server/            ← page-level data assembly

app/
  /                    ← all-accounts grid + total NAV strip
  /accounts/[uuid]/    ← per-account lenses
```

Routes:

| Route | Purpose |
| --- | --- |
| `/` | All-accounts grid + total NAV strip |
| `/accounts/[uuid]/overview` | Holdings-first standard view (any account type) |
| `/accounts/[uuid]/options` | Wheel-strategy lens (accounts with options activity) |
| `/accounts/[uuid]/trades` | Per-account trade history |
| `/accounts/[uuid]/transactions` | Per-account transaction log |
| `/accounts/[uuid]/_debug/twr` | Admin TWR computation dump (not nav-linked) |

## Returns math

Schwab Lens uses **snapshot-aligned TWR** (Time-Weighted Return) to compute returns between any two dates. External cash flows (transfers in/out) are stripped out so deposits don't inflate your headline return. See `docs/methodology.md` (forthcoming) and the `/_debug/twr` route for the full breakdown of any TWR figure shown in the UI.

When in doubt, compare against Schwab's "Performance" tab. Any unexplained divergence is treated as a bug.

## Development

```bash
npm run dev          # start the Next.js dev server
npm run typecheck    # tsc --noEmit
npm run lint
npm test             # vitest run
npm run ingest       # walk data/ and populate the DB
npm run db:reset     # delete data/portfolio.db (re-ingest restores)
```

## Privacy

- The `data/` directory is gitignored. Raw Schwab exports never reach the repo.
- All test fixtures (`tests/fixtures/`) are hand-built fictional data — `ACME` ticker, fake masked account IDs (`XXX999`, `XXX100`), invented amounts.
- See `CLAUDE.md` for the financial-data hygiene rule.

## License

MIT (LICENSE file forthcoming).

---

*Built collaboratively with [Claude Code](https://claude.com/claude-code).*
