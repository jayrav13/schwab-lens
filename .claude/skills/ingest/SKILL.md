---
name: ingest
description: Move Schwab Demo Transactions and Positions CSVs from ~/Downloads into this repo's data/ subdirectories. Use when the user says "ingest my schwab-lens", "move schwab-lens downloads", invokes /ingest, or has just downloaded Schwab exports they want in the repo.
---

# Demo — ingest downloaded CSVs

Move any Schwab Demo CSVs sitting in `~/Downloads` into the correct subdirectory of this repo. Safe to re-run: uses `mv -n` (no-clobber) so nothing is overwritten.

Assume the repo root is the current working directory.

Execute these steps in order.

1. Ensure the destination dirs exist:

   ```bash
   mkdir -p data/transactions data/positions
   ```

2. Move Transactions CSVs:

   ```bash
   for f in ~/Downloads/Demo*Transactions*.csv; do
     [ -e "$f" ] || continue
     mv -n "$f" data/transactions/
   done
   ```

3. Move Positions CSVs:

   ```bash
   for f in ~/Downloads/Demo*Positions*.csv; do
     [ -e "$f" ] || continue
     mv -n "$f" data/positions/
   done
   ```

4. Report what moved and what stayed:

   ```bash
   echo "== data/transactions =="
   ls -1 data/transactions/ || true
   echo "== data/positions =="
   ls -1 data/positions/ || true
   echo "== ~/Downloads (remaining Demo files were kept because a same-name file already existed at the destination) =="
   ls -1 ~/Downloads/ 2>/dev/null | grep -E '^Demo' || echo "(none)"
   ```

Never commit or push — the user runs those manually. This skill only moves files on the local filesystem.
