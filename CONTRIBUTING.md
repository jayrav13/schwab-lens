# Contributing to Schwab Lens

Thanks for your interest. A few ground rules before you open a PR.

## Financial-data hygiene — hard rule

**Never commit real financial data.** This repo is public and intended to be cloned and run by other Schwab account holders. Before any commit, PR, or push:

- `data/`, `transactions/`, `sheets/` are gitignored and must stay that way.
- Any `*.csv` or `*.xlsx` is presumed sensitive — do NOT add exceptions for real exports.
- The ONE allowed exception is `tests/fixtures/**/*.csv`, and those fixtures must be **fully fictional**: hand-built, fake tickers (we use `ACME`), fake masked account IDs (`XXX999`, `XXX100`), invented amounts. Double-check before adding a new fixture.
- If you see a file with what looks like real transaction history, holdings, balances, or an account number in a diff, STOP and flag it.

Run `git status` and `git diff --cached` before every commit to confirm no sensitive files are staged.

## Workflow

Issue → Branch → Commit → PR → Merge.

### Branch naming

`fix/<issue-number>-<brief-description>` (e.g., `fix/2-snapshot-aligned-twr`).

### Commit messages

Body should include `Closes #<issue-number>` and a co-authorship footer when AI-assisted:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

### PR requirements

- Each PR must leave the site in a healthy, working state. No "half-done" merges.
- The PR description includes a **manual test plan** checklist covering the user-visible behavior of the change. CI runs lint/typecheck/test; manual is for verifying the actual feature.
- Use **merge commits** (not squash) so per-task commit history is preserved.

## Local development

See [README.md](README.md). TL;DR:

```bash
npm install
npm run dev        # Next.js dev server
npm run typecheck
npm run lint
npm test
npm run ingest     # populate data/portfolio.db from CSVs in data/
```

## Reporting issues

Use the issue templates:

- **v1 feature** — for the open issues #1–#7 from the design spec.
- **Follow-up** — for issues filed during design as deferred work (the F1–F8 catalog).
- **Bug** — for things that are broken.

When in doubt, link to the spec section your issue relates to: [`docs/superpowers/specs/2026-04-27-schwab-lens-design.md`](docs/superpowers/specs/2026-04-27-schwab-lens-design.md).

## Validation discipline

Numbers shown on the dashboard need to be defensible. The math (especially TWR) is meant to converge with what Schwab shows. Treat any unexplained divergence between Lens and Schwab as a bug until the divergence is documented in `docs/methodology.md` (forthcoming).

The `/accounts/[uuid]/_debug/twr` route exists exactly so you can verify any TWR figure shown anywhere in the UI by reading off the inputs and the chained product.
