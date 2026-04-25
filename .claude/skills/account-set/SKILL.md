---
name: account-set
description: Set or inspect per-account projection metadata (label, group, growth rate, target value, seed date / value, benchmark) on accounts in this repo. Use when the user says "set <label>'s growth rate to N%", "give <label> a target of $X", "tag <label> as <group>", "show me <label>'s projection settings", or invokes /account-set.
---

# Set or inspect per-account metadata

Wraps `npm run account:configure` and `npm run account:show`. Use these commands rather than editing the SQLite DB directly.

Assume the repo root is the current working directory.

## Identify the account

The user usually refers to an account by its label (e.g. "Demo", "Roth IRA"). Resolve to a `<brokerage>:<external_id>` pair.

1. List accounts to find a match:

   ```bash
   sqlite3 data/portfolio.db "SELECT brokerage_slug || ':' || external_id AS id, label, account_group FROM accounts ORDER BY label;"
   ```

2. If exactly one row matches the user's label (case-insensitive substring is fine), use its `id`.

3. If multiple match, list them and ask the user to pick.

4. If none match, report which labels exist and ask for clarification.

## Mutations

For each user intent, run the equivalent CLI flag:

| User intent | Flag |
| --- | --- |
| "set rate to 7%" | `--expected-real-return=7%` |
| "set rate to 0.07" | `--expected-real-return=0.07` |
| "set target to $1,000,000" or "$1M" | `--target=1000000` |
| "tag as Managed" / "set group to Managed" | `--group=Managed` |
| "clear group" | `--group=""` |
| "rename to NewLabel" | `--label=NewLabel` |
| "set seed date 2026-01-15 and seed value $25k" | `--seed-date=2026-01-15 --seed-value=12345` |
| "set benchmark to SPY" | `--benchmark=SPY` |
| "make this the primary dashboard account" | `--primary` |

Run the configure command and then run `npm run account:show` to confirm:

```bash
npm run account:configure -- --account=<id> <flags>
npm run account:show -- --account=<id>
```

## Read-only intent

If the user is asking what's set rather than changing it, just run:

```bash
npm run account:show -- --account=<id>
```

## Never

- Edit the DB file directly with `sqlite3 ... UPDATE`. Always go through the CLI so validation runs.
- Commit or push. The user does that manually.
