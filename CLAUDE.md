# CLAUDE.md

Guidance for Claude Code sessions in this repository.

## What this is

A personal web dashboard for tracking performance of the Schwab "Demo" account (wheel strategy — selling options for premium). Built in Next.js. Stateless: the app re-derives everything from the newest CSV export in the data drop zone.

Related repos:
- `~/Code/tenor` — Rails app with a `/schwab-lens` screener used to *place* trades. This repo is about *measuring*, not trading.

## Financial data hygiene — hard rule

**Never commit real financial data.** The repo is intended to be shareable (potentially public, or shared with other Schwab users). Before any commit, PR, or push, Claude MUST verify that no real account data is staged. In particular:

- `transactions/`, `sheets/`, `data/` are gitignored and must stay that way
- Any `*.csv` or `*.xlsx` file is presumed sensitive — do NOT add exceptions for real exports
- The ONE allowed exception is `tests/fixtures/*.csv`, and those fixtures must be FULLY FICTIONAL: hand-built, no real tickers from the author's portfolio, no real transaction amounts. If adding a new fixture, double-check it's invented.
- If you see a file with what looks like real transaction history, holdings, balances, dividends, or an account number in a diff, STOP and flag it

Checking means running `git status` and `git diff --cached` before commits and PR creation, and confirming no sensitive files appear. This check goes into the PR flow below — do not skip it.

## Git workflow

Issue → Branch → Commit → PR → Merge. Same pattern as `tenor`.

### Before every commit and PR
- Run `git status` and `git diff --cached`
- Verify no files under `transactions/`, `sheets/`, `data/`, and no `*.csv` or `*.xlsx` are staged
- Only proceed if clean

### Branches
`fix/<issue-number>-<brief-description>` (e.g., `fix/3-premium-by-ticker-card`)

### Commits
Include `Closes #<issue-number>` in the body and a co-authorship footer:
```
Co-Authored-By: Claude <noreply@anthropic.com>
```

### PRs
Use `gh pr create` with a body that includes `*Co-authored by Claude*`. Use merge commits (not squash).

## Stack

- Next.js (App Router, TypeScript)
- Stateless — newest CSV in the drop zone is the source of truth
- No external market-data dependencies in v1 (see spec for v2 mark-to-market)
