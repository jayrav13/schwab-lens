---
name: ingest
description: Move brokerage CSV exports (Schwab, plus Robinhood/Chase/Fidelity adapters as they land) from ~/Downloads into the repo's data/<brokerage>/<account>/ folders, then upsert into data/portfolio.db. Use when the user says "ingest my data", invokes /ingest, or has just downloaded brokerage exports.
---

# Ingest brokerage CSVs

Moves any brokerage CSVs sitting in `~/Downloads` into the correct `data/<brokerage>/<account>/<kind>/` folder and runs the DB upsert. Idempotent.

Assume the repo root is the current working directory.

Execute these steps in order.

1. Route files from `~/Downloads` into `data/`:

   ```bash
   npx tsx scripts/route-downloads.ts
   ```

2. Run the DB upsert:

   ```bash
   npm run ingest
   ```

3. Report the routing summary and the ingest summary verbatim, plus a one-line interpretation. Surface any "unmatched" files in `~/Downloads` so the user knows nothing was silently consumed.

Never commit or push — the user does that manually. This skill only moves files locally and updates the DB.
