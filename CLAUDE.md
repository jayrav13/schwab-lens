# CLAUDE.md

Guidance for Claude Code sessions in this repository.

## What this is

**Schwab Lens** is a local-first, read-only visualization tool for Schwab brokerage accounts. The product takes Schwab's CSV exports as the source of truth, ingests them idempotently into a local SQLite database (`data/portfolio.db`), and renders multiple per-account dashboards — a generic *overview*, an *options/wheel-strategy* lens, and per-account *trades* and *transactions* views.

No data leaves the user's machine. No trading. Schwab-only by design — multi-brokerage support would belong in a separate repo (e.g., `<brokerage>-lens`), not as a feature of this one.

The active design spec is `docs/superpowers/specs/2026-04-27-schwab-lens-design.md`; per-issue implementation plans live in `docs/superpowers/plans/`. Issues #1–#7 cover v1; F1–F8 are filed follow-ups.

## Financial data hygiene — hard rule

**Never commit real financial data.** The repo is public. Before any commit, PR, or push, Claude MUST verify that no real account data is staged. In particular:

- `transactions/`, `sheets/`, `data/` are gitignored and must stay that way
- Any `*.csv` or `*.xlsx` file is presumed sensitive — do NOT add exceptions for real exports
- The ONE allowed exception is `tests/fixtures/**/*.csv`, and those fixtures must be FULLY FICTIONAL: hand-built, no real tickers from the author's portfolio, no real transaction amounts, fake masked account IDs (e.g., `XXX999`, `XXX100`)
- If you see a file with what looks like real transaction history, holdings, balances, dividends, or an account number in a diff, STOP and flag it

Checking means running `git status` and `git diff --cached` before commits and PR creation, and confirming no sensitive files appear. This check goes into the PR flow below — do not skip it.

## Git workflow

Issue → Branch → Commit → PR → Merge.

### Before every commit and PR
- Run `git status` and `git diff --cached`
- Verify no files under `transactions/`, `sheets/`, `data/`, and no `*.csv` or `*.xlsx` are staged
- Only proceed if clean

### Branches
`fix/<issue-number>-<brief-description>` (e.g., `fix/2-snapshot-aligned-twr`)

### Commits
Include `Closes #<issue-number>` in the body and a co-authorship footer:
```
Co-Authored-By: Claude <noreply@anthropic.com>
```

Each issue must leave the site in a healthy, working state. Every PR description includes a manual test plan checklist.

### PRs
Use `gh pr create` with a body that includes `*Co-authored by Claude*`. Use merge commits (not squash).

## Stack

- Next.js 16 (App Router, TypeScript)
- `better-sqlite3` for the local DB layer
- `papaparse` for CSV parsing
- `yahoo-finance2` for benchmark / historical price data
- Vitest for tests

## Architecture (post-foundation)

```
data/                  ← gitignored
  portfolio.db         ← SQLite, derived projection of CSVs
  transactions/*.csv   ← user-dropped exports
  positions/*.csv

lib/db/                ← connection, migrations, repos
lib/schwab/            ← Schwab CSV parsing (no abstraction; Schwab-only)
lib/metrics/           ← TWR, holdings, allocation, benchmark
lib/server/            ← page-level data assembly

scripts/ingest.ts      ← npm run ingest entry point
scripts/account-configure.ts ← npm run account:configure entry point

app/
  page.tsx                 ← / (all-accounts grid + total NAV strip)
  accounts/[uuid]/
    overview/page.tsx      ← holdings-first standard view
    options/page.tsx       ← wheel-strategy lens
    trades/page.tsx
    transactions/page.tsx
    _debug/twr/page.tsx    ← admin TWR computation dump (not nav-linked)
```

## Key principles

- **CSVs are source of truth, the DB is derived.** `rm data/portfolio.db && npm run ingest` returns to identical state.
- **No `data/config.json`.** All settings live in DB tables (`accounts.*` for per-account, `settings` for global).
- **UUID is the URL identifier.** `accounts.id` (integer PK) and `accounts.external_id` (Schwab masked digits) are internal-only.
- **Validate against Schwab.** Treat divergences between Lens TWR and Schwab's reported numbers as bugs until understood. Document understood divergences in `docs/methodology.md`.
