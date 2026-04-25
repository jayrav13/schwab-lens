# Phase 2: Per-Account Projections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-editable per-account metadata (`expected_real_return`, `target_value`, `account_group`) and a per-account "years to target" projection card on the dashboard. Editing via extended `account:configure` CLI + thin `/account-set` skill.

**Architecture:** Three orthogonal concerns. (1) Schema migration adds three nullable columns to `accounts`. (2) Editing extends the existing CLI + adds a thin conversational skill that wraps it. (3) Rendering uses a pure `computeProjection()` function feeding a new `ProjectionCard` slotted into the existing main dashboard. No UI mutation surface in Phase 2; the card is read-only.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Vitest · `better-sqlite3` · `tsx`

**Spec:** `docs/superpowers/specs/2026-04-24-phase2-per-account-projections-design.md`. **Tracking issue:** [#16](https://github.com/jayrav13/schwab-lens/issues/16). **Branch:** continue on `fix/16-phase2-per-account-projections`.

**Hygiene:** before every commit, run `git status` and `git diff --cached`. Verify no `*.csv` / `*.xlsx` files and no files under `transactions/`, `sheets/`, `data/` are staged. `tests/fixtures/**/*.csv` is the only exception, and those CSVs MUST be fully fictional.

---

## File Structure

### New files

```
db/migrations/002-account-projections.sql

lib/model/metrics/projection.ts
app/components/ProjectionCard.tsx

scripts/account-show.ts
.claude/skills/account-set/SKILL.md

tests/model/metrics/projection.test.ts
tests/scripts/account-show.test.ts
```

### Modified files

```
package.json                              # add account:show script
lib/db/repos/accounts.ts                  # +3 fields on Account, +3 update fns
lib/scripts/accountConfigure.ts           # accept 3 new optional inputs
scripts/account-configure.ts              # parse 3 new flags
lib/server/dashboardSource.ts             # propagate new account fields (already mostly through Account)
lib/server/dashboard.ts                   # compute + expose ProjectionResult
app/page.tsx                              # render ProjectionCard

tests/db/migrate.test.ts                  # assert new columns exist
tests/db/repos/accounts.test.ts           # round-trip new fields
tests/scripts/account-configure.test.ts   # cover new flags + parsing
tests/integration.test.ts                 # assert projection in DashboardData
```

---

## Task 1: Migration 002 — add three columns to `accounts`

**Files:**
- Create: `db/migrations/002-account-projections.sql`
- Modify: `tests/db/migrate.test.ts` — extend the existing "all expected tables" assertion to also assert the new columns.

- [ ] **Step 1: Append the failing test to `tests/db/migrate.test.ts`**

Add to the existing `describe("runMigrations against db/migrations/", ...)` block:

```ts
  it("adds expected_real_return, target_value, account_group columns to accounts", () => {
    const db = openDb(":memory:");
    runMigrations(db, path.join(process.cwd(), "db", "migrations"));

    const cols = (db
      .prepare("PRAGMA table_info('accounts')")
      .all() as Array<{ name: string }>).map((r) => r.name);

    for (const c of ["expected_real_return", "target_value", "account_group"]) {
      expect(cols).toContain(c);
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/db/migrate.test.ts
```

Expected: FAIL — the new columns do not yet exist.

- [ ] **Step 3: Create `db/migrations/002-account-projections.sql`**

```sql
-- Phase 2: per-account projection inputs.
-- See spec: docs/superpowers/specs/2026-04-24-phase2-per-account-projections-design.md

ALTER TABLE accounts ADD COLUMN expected_real_return REAL;

ALTER TABLE accounts ADD COLUMN target_value REAL;

ALTER TABLE accounts ADD COLUMN account_group TEXT;
```

(Each `ALTER` is its own statement so the migration runner's splitter handles them cleanly.)

- [ ] **Step 4: Run migrate tests to verify they pass**

```bash
npx vitest run tests/db/migrate.test.ts
```

Expected: 7 passed (previous 6 + new one).

- [ ] **Step 5: Commit**

```bash
git add db/migrations/002-account-projections.sql tests/db/migrate.test.ts
git status
git commit -m "$(cat <<'EOF'
Add migration 002: per-account projection columns

Adds expected_real_return, target_value, account_group as nullable
columns on accounts.

Refs #16.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `Account` type + add three update functions

**Files:**
- Modify: `lib/db/repos/accounts.ts`
- Modify: `tests/db/repos/accounts.test.ts`

- [ ] **Step 1: Append the failing tests to `tests/db/repos/accounts.test.ts`**

Add inside the existing `describe("accounts repo", ...)` block:

```ts
  it("Account row exposes expectedRealReturn, targetValue, accountGroup as null by default", () => {
    const db = freshDb();
    upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    const got = getAccountByExternal(db, "schwab", "999");
    expect(got?.expectedRealReturn).toBeNull();
    expect(got?.targetValue).toBeNull();
    expect(got?.accountGroup).toBeNull();
  });

  it("updateAccountReturn sets and clears expected_real_return", () => {
    const db = freshDb();
    const id = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    updateAccountReturn(db, id, 0.07);
    expect(getAccountByExternal(db, "schwab", "999")?.expectedRealReturn).toBe(0.07);
    updateAccountReturn(db, id, null);
    expect(getAccountByExternal(db, "schwab", "999")?.expectedRealReturn).toBeNull();
  });

  it("updateAccountTarget sets and clears target_value", () => {
    const db = freshDb();
    const id = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    updateAccountTarget(db, id, 1_000_000);
    expect(getAccountByExternal(db, "schwab", "999")?.targetValue).toBe(1_000_000);
    updateAccountTarget(db, id, null);
    expect(getAccountByExternal(db, "schwab", "999")?.targetValue).toBeNull();
  });

  it("updateAccountGroup sets and clears account_group", () => {
    const db = freshDb();
    const id = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    updateAccountGroup(db, id, "Managed");
    expect(getAccountByExternal(db, "schwab", "999")?.accountGroup).toBe("Managed");
    updateAccountGroup(db, id, null);
    expect(getAccountByExternal(db, "schwab", "999")?.accountGroup).toBeNull();
  });
```

Also extend the existing import:

```ts
import {
  upsertAccount,
  getAccountByExternal,
  listAccounts,
  updateAccountSeed,
  updateAccountLabel,
  updateAccountBenchmark,
  updateAccountReturn,
  updateAccountTarget,
  updateAccountGroup,
} from "@/lib/db/repos/accounts";
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/db/repos/accounts.test.ts
```

Expected: FAIL — new exports + new fields don't exist.

- [ ] **Step 3: Update `lib/db/repos/accounts.ts`**

Replace the file with:

```ts
import type { Db } from "@/lib/db/connect";

export type Account = {
  id: number;
  brokerageSlug: string;
  externalId: string;
  label: string;
  seedDate: string | null;
  seedValue: number | null;
  benchmark: string | null;
  expectedRealReturn: number | null;
  targetValue: number | null;
  accountGroup: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

type AccountRow = {
  id: number;
  brokerage_slug: string;
  external_id: string;
  label: string;
  seed_date: string | null;
  seed_value: number | null;
  benchmark: string | null;
  expected_real_return: number | null;
  target_value: number | null;
  account_group: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    brokerageSlug: r.brokerage_slug,
    externalId: r.external_id,
    label: r.label,
    seedDate: r.seed_date,
    seedValue: r.seed_value,
    benchmark: r.benchmark,
    expectedRealReturn: r.expected_real_return,
    targetValue: r.target_value,
    accountGroup: r.account_group,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
  };
}

export type UpsertAccountInput = {
  brokerageSlug: string;
  externalId: string;
  label: string;
  now?: string;
};

export function upsertAccount(db: Db, input: UpsertAccountInput): number {
  const now = input.now ?? new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO accounts (brokerage_slug, external_id, label, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(brokerage_slug, external_id) DO UPDATE SET
      label = excluded.label,
      last_seen_at = excluded.last_seen_at
    RETURNING id
  `);
  const row = stmt.get(input.brokerageSlug, input.externalId, input.label, now, now) as { id: number };
  return row.id;
}

export function getAccountByExternal(
  db: Db,
  brokerageSlug: string,
  externalId: string,
): Account | null {
  const row = db
    .prepare("SELECT * FROM accounts WHERE brokerage_slug = ? AND external_id = ?")
    .get(brokerageSlug, externalId) as AccountRow | undefined;
  return row ? rowToAccount(row) : null;
}

export function getAccountById(db: Db, id: number): Account | null {
  const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow | undefined;
  return row ? rowToAccount(row) : null;
}

export function listAccounts(db: Db): Account[] {
  const rows = db
    .prepare("SELECT * FROM accounts ORDER BY brokerage_slug, external_id")
    .all() as AccountRow[];
  return rows.map(rowToAccount);
}

export function updateAccountSeed(
  db: Db,
  accountId: number,
  seedDate: string | null,
  seedValue: number | null,
): void {
  db.prepare("UPDATE accounts SET seed_date = ?, seed_value = ? WHERE id = ?")
    .run(seedDate, seedValue, accountId);
}

export function updateAccountLabel(db: Db, accountId: number, label: string): void {
  db.prepare("UPDATE accounts SET label = ? WHERE id = ?").run(label, accountId);
}

export function updateAccountBenchmark(
  db: Db,
  accountId: number,
  benchmark: string | null,
): void {
  db.prepare("UPDATE accounts SET benchmark = ? WHERE id = ?").run(benchmark, accountId);
}

export function updateAccountReturn(
  db: Db,
  accountId: number,
  rate: number | null,
): void {
  db.prepare("UPDATE accounts SET expected_real_return = ? WHERE id = ?")
    .run(rate, accountId);
}

export function updateAccountTarget(
  db: Db,
  accountId: number,
  target: number | null,
): void {
  db.prepare("UPDATE accounts SET target_value = ? WHERE id = ?")
    .run(target, accountId);
}

export function updateAccountGroup(
  db: Db,
  accountId: number,
  group: string | null,
): void {
  db.prepare("UPDATE accounts SET account_group = ? WHERE id = ?")
    .run(group, accountId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/db/repos/accounts.test.ts
```

Expected: 9 passed (5 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add lib/db/repos/accounts.ts tests/db/repos/accounts.test.ts
git status
git commit -m "$(cat <<'EOF'
Extend accounts repo with projection inputs

Account type now exposes expectedRealReturn, targetValue, accountGroup.
New setters: updateAccountReturn / Target / Group.

Refs #16.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extend `configureAccount` with three new inputs

**Files:**
- Modify: `lib/scripts/accountConfigure.ts`
- Modify: `tests/scripts/account-configure.test.ts`

- [ ] **Step 1: Append the failing tests to `tests/scripts/account-configure.test.ts`**

```ts
  it("sets expectedRealReturn, targetValue, accountGroup", () => {
    const db = freshDb();
    configureAccount(db, {
      account: "schwab:999",
      expectedRealReturn: 0.07,
      targetValue: 1_000_000,
      accountGroup: "Managed",
    });
    const got = getAccountByExternal(db, "schwab", "999");
    expect(got?.expectedRealReturn).toBe(0.07);
    expect(got?.targetValue).toBe(1_000_000);
    expect(got?.accountGroup).toBe("Managed");
  });

  it("clears accountGroup when passed empty string", () => {
    const db = freshDb();
    configureAccount(db, { account: "schwab:999", accountGroup: "Managed" });
    configureAccount(db, { account: "schwab:999", accountGroup: "" });
    expect(getAccountByExternal(db, "schwab", "999")?.accountGroup).toBeNull();
  });

  it("rejects non-positive target", () => {
    const db = freshDb();
    expect(() => configureAccount(db, { account: "schwab:999", targetValue: 0 }))
      .toThrow(/target/i);
    expect(() => configureAccount(db, { account: "schwab:999", targetValue: -10 }))
      .toThrow(/target/i);
  });

  it("rejects expectedRealReturn <= -1", () => {
    const db = freshDb();
    expect(() => configureAccount(db, { account: "schwab:999", expectedRealReturn: -1 }))
      .toThrow(/return/i);
    expect(() => configureAccount(db, { account: "schwab:999", expectedRealReturn: -2 }))
      .toThrow(/return/i);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/scripts/account-configure.test.ts
```

Expected: FAIL — `configureAccount` does not accept those inputs.

- [ ] **Step 3: Replace `lib/scripts/accountConfigure.ts`**

```ts
import type { Db } from "@/lib/db/connect";
import {
  getAccountByExternal,
  updateAccountSeed,
  updateAccountLabel,
  updateAccountBenchmark,
  updateAccountReturn,
  updateAccountTarget,
  updateAccountGroup,
} from "@/lib/db/repos/accounts";
import { setSetting, setBoolSetting } from "@/lib/db/repos/settings";

export type ConfigureInput = {
  account: string;
  seedDate?: string;
  seedValue?: number;
  label?: string;
  benchmark?: string;
  primary?: boolean;
  marketDataEnabled?: boolean;
  expectedRealReturn?: number;
  targetValue?: number;
  accountGroup?: string;
};

export function configureAccount(db: Db, input: ConfigureInput): void {
  const m = input.account.match(/^([a-z]+):([A-Za-z0-9]+)$/);
  if (!m) {
    throw new Error(
      `configureAccount: --account must be '<brokerage>:<external_id>', got: ${input.account}`,
    );
  }
  const [, brokerageSlug, externalId] = m;

  const account = getAccountByExternal(db, brokerageSlug, externalId);
  if (!account) {
    throw new Error(
      `configureAccount: No account ${input.account} — has it been ingested?`,
    );
  }

  if (input.expectedRealReturn !== undefined) {
    if (!Number.isFinite(input.expectedRealReturn) || input.expectedRealReturn <= -1) {
      throw new Error(
        `configureAccount: expected real return must be > -1, got: ${input.expectedRealReturn}`,
      );
    }
  }
  if (input.targetValue !== undefined) {
    if (!Number.isFinite(input.targetValue) || input.targetValue <= 0) {
      throw new Error(
        `configureAccount: target value must be > 0, got: ${input.targetValue}`,
      );
    }
  }

  if (input.label !== undefined) updateAccountLabel(db, account.id, input.label);
  if (input.benchmark !== undefined) updateAccountBenchmark(db, account.id, input.benchmark);
  if (input.seedDate !== undefined || input.seedValue !== undefined) {
    const seedDate = input.seedDate ?? account.seedDate;
    const seedValue = input.seedValue ?? account.seedValue;
    updateAccountSeed(db, account.id, seedDate, seedValue);
  }
  if (input.expectedRealReturn !== undefined) {
    updateAccountReturn(db, account.id, input.expectedRealReturn);
  }
  if (input.targetValue !== undefined) {
    updateAccountTarget(db, account.id, input.targetValue);
  }
  if (input.accountGroup !== undefined) {
    updateAccountGroup(db, account.id, input.accountGroup === "" ? null : input.accountGroup);
  }
  if (input.primary === true) {
    setSetting(db, "dashboard.primary_account", input.account);
  }
  if (input.marketDataEnabled !== undefined) {
    setBoolSetting(db, "market_data.enabled", input.marketDataEnabled);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/scripts/account-configure.test.ts
```

Expected: 9 passed (5 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add lib/scripts/accountConfigure.ts tests/scripts/account-configure.test.ts
git status
git commit -m "$(cat <<'EOF'
Extend configureAccount with projection inputs

Accepts expectedRealReturn, targetValue, accountGroup. Rejects
non-positive target and rate <= -1. Empty-string accountGroup clears
the column.

Refs #16.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extend `account-configure.ts` CLI flags

**Files:**
- Modify: `scripts/account-configure.ts`

- [ ] **Step 1: Replace the file**

```ts
import path from "node:path";
import { openDb } from "@/lib/db/connect";
import { configureAccount, type ConfigureInput } from "@/lib/scripts/accountConfigure";

function parseRate(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) {
    const n = Number(trimmed.slice(0, -1)) / 100;
    if (!Number.isFinite(n)) {
      throw new Error(`account-configure: cannot parse --expected-real-return ${raw}`);
    }
    return n;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    throw new Error(`account-configure: cannot parse --expected-real-return ${raw}`);
  }
  if (n >= 1) {
    console.error(
      `account-configure: WARNING — --expected-real-return=${n} interpreted as ${n * 100}% per year. ` +
        `If you meant ${n}%, pass --expected-real-return=${n}% instead. Proceeding with literal value.`,
    );
  }
  return n;
}

function parseArgs(argv: string[]): ConfigureInput {
  const out: ConfigureInput = { account: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const key = eq >= 0 ? a.slice(0, eq) : a;
    const val = eq >= 0 ? a.slice(eq + 1) : argv[++i];
    switch (key) {
      case "--account":              out.account = val; break;
      case "--seed-date":            out.seedDate = val; break;
      case "--seed-value":           out.seedValue = Number(val); break;
      case "--label":                out.label = val; break;
      case "--benchmark":            out.benchmark = val; break;
      case "--primary":              out.primary = true; i--; break;
      case "--market-data":          out.marketDataEnabled = val === "on" || val === "true"; break;
      case "--expected-real-return": out.expectedRealReturn = parseRate(val); break;
      case "--target":               out.targetValue = Number(val); break;
      case "--group":                out.accountGroup = val; break;
      default:
        throw new Error(`account-configure: unknown flag ${key}`);
    }
  }
  if (!out.account) throw new Error("account-configure: --account is required");
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = path.join(process.cwd(), "data", "portfolio.db");
  const db = openDb(dbPath);
  try {
    configureAccount(db, args);
    console.log(`configured ${args.account}`);
  } finally {
    db.close();
  }
}

main();
```

- [ ] **Step 2: Smoke test**

(No automated test for `parseArgs` itself — the function-level tests in `configureAccount` cover the mutation behavior. This script is glue.)

```bash
# Should fail with "No account schwab:999" since fixture not set up,
# but argv parsing must succeed:
npm run account:configure -- --account=schwab:999 --expected-real-return=7% --target=1000000 --group=Managed 2>&1 | tail -3
```

Expected: error about `No account schwab:999`, NOT a parsing error.

- [ ] **Step 3: Run the full test suite + typecheck**

```bash
npm run test
npm run typecheck
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/account-configure.ts
git status
git commit -m "$(cat <<'EOF'
Add --expected-real-return / --target / --group CLI flags

Rate parsing accepts decimal (0.07) or percent suffix (7%); warns to
stderr when a value >= 1 is passed without %.

Refs #16.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `npm run account:show` admin command

**Files:**
- Create: `scripts/account-show.ts`
- Create: `tests/scripts/account-show.test.ts`
- Create: `lib/scripts/accountShow.ts` (the testable function)
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/account-show.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import { configureAccount } from "@/lib/scripts/accountConfigure";
import { formatAccountShow } from "@/lib/scripts/accountShow";

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("formatAccountShow", () => {
  it("includes every configurable field for an unconfigured account", () => {
    const db = freshDb();
    upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "Demo" });
    const out = formatAccountShow(db, "schwab:999");
    expect(out).toContain("brokerage_slug:");
    expect(out).toContain("external_id:");
    expect(out).toContain("label:                 Demo");
    expect(out).toContain("seed_date:             (unset)");
    expect(out).toContain("seed_value:            (unset)");
    expect(out).toContain("benchmark:             (unset)");
    expect(out).toContain("expected_real_return:  (unset)");
    expect(out).toContain("target_value:          (unset)");
    expect(out).toContain("account_group:         (unset)");
  });

  it("shows configured field values", () => {
    const db = freshDb();
    upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "Demo" });
    configureAccount(db, {
      account: "schwab:999",
      seedDate: "2026-01-15",
      seedValue: 12345,
      benchmark: "SPY",
      expectedRealReturn: 0.07,
      targetValue: 1_000_000,
      accountGroup: "Managed",
    });
    const out = formatAccountShow(db, "schwab:999");
    expect(out).toContain("seed_date:             2026-01-15");
    expect(out).toContain("seed_value:            12345");
    expect(out).toContain("benchmark:             SPY");
    expect(out).toContain("expected_real_return:  0.07");
    expect(out).toContain("target_value:          1000000");
    expect(out).toContain("account_group:         Managed");
  });

  it("throws for unknown account", () => {
    expect(() => formatAccountShow(freshDb(), "schwab:000")).toThrow(/No account/);
  });

  it("throws on malformed --account", () => {
    expect(() => formatAccountShow(freshDb(), "bad-format")).toThrow(/format/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/scripts/account-show.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/scripts/accountShow.ts`**

```ts
import type { Db } from "@/lib/db/connect";
import { getAccountByExternal } from "@/lib/db/repos/accounts";

const FIELDS: Array<[label: string, key: keyof FieldsView]> = [
  ["brokerage_slug:      ", "brokerageSlug"],
  ["external_id:         ", "externalId"],
  ["label:               ", "label"],
  ["seed_date:           ", "seedDate"],
  ["seed_value:          ", "seedValue"],
  ["benchmark:           ", "benchmark"],
  ["expected_real_return:", "expectedRealReturn"],
  ["target_value:        ", "targetValue"],
  ["account_group:       ", "accountGroup"],
  ["first_seen_at:       ", "firstSeenAt"],
  ["last_seen_at:        ", "lastSeenAt"],
];

type FieldsView = {
  brokerageSlug: string;
  externalId: string;
  label: string;
  seedDate: string | null;
  seedValue: number | null;
  benchmark: string | null;
  expectedRealReturn: number | null;
  targetValue: number | null;
  accountGroup: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "(unset)";
  return String(v);
}

export function formatAccountShow(db: Db, account: string): string {
  const m = account.match(/^([a-z]+):([A-Za-z0-9]+)$/);
  if (!m) {
    throw new Error(
      `account-show: --account must be '<brokerage>:<external_id>' format, got: ${account}`,
    );
  }
  const [, brokerageSlug, externalId] = m;
  const row = getAccountByExternal(db, brokerageSlug, externalId);
  if (!row) {
    throw new Error(`account-show: No account ${account}`);
  }
  const view: FieldsView = {
    brokerageSlug: row.brokerageSlug,
    externalId: row.externalId,
    label: row.label,
    seedDate: row.seedDate,
    seedValue: row.seedValue,
    benchmark: row.benchmark,
    expectedRealReturn: row.expectedRealReturn,
    targetValue: row.targetValue,
    accountGroup: row.accountGroup,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
  };
  const lines: string[] = [];
  for (const [label, key] of FIELDS) {
    lines.push(`${label}  ${fmtVal(view[key])}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/scripts/account-show.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Implement `scripts/account-show.ts`**

```ts
import path from "node:path";
import { openDb } from "@/lib/db/connect";
import { formatAccountShow } from "@/lib/scripts/accountShow";

function parseArgs(argv: string[]): { account: string } {
  let account = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const key = eq >= 0 ? a.slice(0, eq) : a;
    const val = eq >= 0 ? a.slice(eq + 1) : argv[++i];
    switch (key) {
      case "--account": account = val; break;
      default:
        throw new Error(`account-show: unknown flag ${key}`);
    }
  }
  if (!account) throw new Error("account-show: --account is required");
  return { account };
}

function main(): void {
  const { account } = parseArgs(process.argv.slice(2));
  const dbPath = path.join(process.cwd(), "data", "portfolio.db");
  const db = openDb(dbPath);
  try {
    console.log(formatAccountShow(db, account));
  } finally {
    db.close();
  }
}

main();
```

- [ ] **Step 6: Wire up the npm script**

In `package.json` `scripts`, add:

```json
"account:show": "tsx scripts/account-show.ts"
```

- [ ] **Step 7: Smoke test**

```bash
npm run account:show -- --account=schwab:999 2>&1 | tail -3
```

Expected: error about `No account schwab:999` (assuming fixture not set up). Plumbing verified.

- [ ] **Step 8: Commit**

```bash
git add lib/scripts/accountShow.ts scripts/account-show.ts tests/scripts/account-show.test.ts package.json
git status
git commit -m "$(cat <<'EOF'
Add npm run account:show admin command

Prints every configurable field for an account (or '(unset)') so the
user can verify state without sqlite3 ad-hoc queries.

Refs #16.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Pure projection function

**Files:**
- Create: `lib/model/metrics/projection.ts`
- Create: `tests/model/metrics/projection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/model/metrics/projection.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeProjection } from "@/lib/model/metrics/projection";

describe("computeProjection", () => {
  it("returns 'achieved' when currentNav >= targetValue", () => {
    const result = computeProjection({
      currentNav: 1_500_000,
      targetValue: 1_000_000,
      expectedRealReturn: 0.07,
      asOfDate: "2026-04-24",
    });
    expect(result.kind).toBe("achieved");
    if (result.kind !== "achieved") return;
    expect(result.targetValue).toBe(1_000_000);
    expect(result.currentNav).toBe(1_500_000);
  });

  it("returns 'unreachable' with reason 'non-positive-target' when targetValue <= 0", () => {
    const result = computeProjection({
      currentNav: 100,
      targetValue: 0,
      expectedRealReturn: 0.07,
      asOfDate: "2026-04-24",
    });
    expect(result).toEqual({ kind: "unreachable", reason: "non-positive-target" });
  });

  it("returns 'unreachable' with reason 'non-positive-target' when currentNav <= 0", () => {
    const result = computeProjection({
      currentNav: 0,
      targetValue: 1_000_000,
      expectedRealReturn: 0.07,
      asOfDate: "2026-04-24",
    });
    expect(result).toEqual({ kind: "unreachable", reason: "non-positive-target" });
  });

  it("returns 'unreachable' with reason 'non-positive-rate' when expectedRealReturn <= 0", () => {
    const result = computeProjection({
      currentNav: 100_000,
      targetValue: 1_000_000,
      expectedRealReturn: 0,
      asOfDate: "2026-04-24",
    });
    expect(result).toEqual({ kind: "unreachable", reason: "non-positive-rate" });
  });

  it("computes years and target date for the happy path ($10k → $20k at 7%)", () => {
    const result = computeProjection({
      currentNav: 10_000,
      targetValue: 20_000,
      expectedRealReturn: 0.07,
      asOfDate: "2026-04-24",
    });
    expect(result.kind).toBe("computed");
    if (result.kind !== "computed") return;
    // ln(2) / ln(1.07) ≈ 10.2448 years
    expect(result.years).toBeCloseTo(10.2448, 3);
    expect(result.rate).toBe(0.07);
    expect(result.currentNav).toBe(10_000);
    expect(result.targetValue).toBe(20_000);
    // Target date should be 2036-08-09 (10.2448 years after 2026-04-24)
    expect(result.targetDate).toBe("2036-08-09");
  });

  it("rounds target date to the nearest day", () => {
    const result = computeProjection({
      currentNav: 100_000,
      targetValue: 200_000,
      expectedRealReturn: 0.07,
      asOfDate: "2026-01-15",
    });
    if (result.kind !== "computed") throw new Error("expected computed");
    // ln(2) / ln(1.07) ≈ 10.2448 years; from 2026-01-15 → ~2036-04-17
    expect(result.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/model/metrics/projection.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/model/metrics/projection.ts`**

```ts
export type ProjectionInput = {
  currentNav: number;
  targetValue: number;
  expectedRealReturn: number;
  asOfDate: string;
};

export type ProjectionResult =
  | { kind: "achieved"; targetValue: number; currentNav: number }
  | {
      kind: "computed";
      years: number;
      targetDate: string;
      currentNav: number;
      targetValue: number;
      rate: number;
    }
  | { kind: "unreachable"; reason: "non-positive-rate" | "non-positive-target" };

const DAYS_PER_YEAR = 365.25;

function addYearsToDate(asOfDate: string, years: number): string {
  const [y, m, d] = asOfDate.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  const ms = years * DAYS_PER_YEAR * 24 * 60 * 60 * 1000;
  const end = new Date(start + ms);
  // Round to nearest day by snapping to UTC midnight after rounding
  const dayMs = 24 * 60 * 60 * 1000;
  const rounded = new Date(Math.round(end.getTime() / dayMs) * dayMs);
  const yyyy = rounded.getUTCFullYear();
  const mm = String(rounded.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(rounded.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function computeProjection(input: ProjectionInput): ProjectionResult {
  const { currentNav, targetValue, expectedRealReturn, asOfDate } = input;

  if (targetValue <= 0 || currentNav <= 0) {
    return { kind: "unreachable", reason: "non-positive-target" };
  }
  if (currentNav >= targetValue) {
    return { kind: "achieved", currentNav, targetValue };
  }
  if (expectedRealReturn <= 0) {
    return { kind: "unreachable", reason: "non-positive-rate" };
  }

  const years = Math.log(targetValue / currentNav) / Math.log(1 + expectedRealReturn);
  const targetDate = addYearsToDate(asOfDate, years);

  return {
    kind: "computed",
    years,
    targetDate,
    currentNav,
    targetValue,
    rate: expectedRealReturn,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/model/metrics/projection.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/model/metrics/projection.ts tests/model/metrics/projection.test.ts
git status
git commit -m "$(cat <<'EOF'
Add computeProjection pure function

Years-to-target compound-growth formula plus explicit edge-case
dispatch (achieved / unreachable). No I/O.

Refs #16.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire projection into `loadDashboard`

**Files:**
- Modify: `lib/server/dashboard.ts`
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Append the failing test to `tests/integration.test.ts`**

Add a new `describe`/`it` block after the existing tests:

```ts
describe("dashboard projection (DB-backed)", () => {
  it("exposes a 'computed' projection when account has rate + target", async () => {
    writeFixture("999", SHORT_TX_CSV, SHORT_POS_CSV);
    const { openDb } = await import("@/lib/db/connect");
    const { runIngest } = await import("@/lib/ingest/run");
    const { configureAccount } = await import("@/lib/scripts/accountConfigure");
    const { loadDashboard } = await import("@/lib/server/dashboard");

    const dataDir = path.join(tempRoot, "data");
    const dbPath = path.join(dataDir, "portfolio.db");
    const db = openDb(dbPath);
    try {
      runIngest(db, dataDir);
      configureAccount(db, {
        account: "schwab:999",
        primary: true,
        seedDate: "2026-01-02",
        seedValue: 10000,
        marketDataEnabled: false,
        expectedRealReturn: 0.07,
        targetValue: 100_000,
      });
    } finally {
      db.close();
    }

    const result = await loadDashboard({
      includeMarketData: false,
      dataDir,
      migrationsDir: MIGRATIONS_DIR,
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.projection.kind).toBe("computed");
    if (result.projection.kind !== "computed") return;
    expect(result.projection.rate).toBe(0.07);
    expect(result.projection.years).toBeGreaterThan(0);
    expect(result.projection.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("exposes 'unconfigured' projection when account has no rate or target", async () => {
    writeFixture("999", SHORT_TX_CSV, SHORT_POS_CSV);
    const { openDb } = await import("@/lib/db/connect");
    const { runIngest } = await import("@/lib/ingest/run");
    const { configureAccount } = await import("@/lib/scripts/accountConfigure");
    const { loadDashboard } = await import("@/lib/server/dashboard");

    const dataDir = path.join(tempRoot, "data");
    const dbPath = path.join(dataDir, "portfolio.db");
    const db = openDb(dbPath);
    try {
      runIngest(db, dataDir);
      configureAccount(db, {
        account: "schwab:999",
        primary: true,
        seedDate: "2026-01-02",
        seedValue: 10000,
        marketDataEnabled: false,
      });
    } finally {
      db.close();
    }

    const result = await loadDashboard({
      includeMarketData: false,
      dataDir,
      migrationsDir: MIGRATIONS_DIR,
    });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.projection.kind).toBe("unconfigured");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/integration.test.ts
```

Expected: FAIL — `result.projection` doesn't exist.

- [ ] **Step 3: Update `lib/server/dashboard.ts`**

Add to the imports at the top:

```ts
import { computeProjection, type ProjectionResult } from "@/lib/model/metrics/projection";
```

Update the `DashboardData` "ready" variant to include `projection`:

```ts
export type DashboardProjection =
  | ProjectionResult
  | { kind: "unconfigured"; reason: "missing-rate" | "missing-target" };

export type DashboardData =
  | {
      kind: "ready";
      state: PortfolioState;
      sourceFiles: { transactions: string[]; positions: string[] };
      loadedAt: string;
      markToMarket: MarkToMarket | null;
      latestSnapshot: PositionsSnapshot | null;
      projection: DashboardProjection;
    }
  | { kind: "no-csv"; dataDir: string }
  | { kind: "no-config"; dataDir: string }
  | { kind: "parse-error"; message: string };
```

Inside `loadDashboard`, after the `state` is computed and before the `return { kind: "ready", ... }`, build the projection:

```ts
    let projection: DashboardProjection;
    if (account.expectedRealReturn === null) {
      projection = { kind: "unconfigured", reason: "missing-rate" };
    } else if (account.targetValue === null) {
      projection = { kind: "unconfigured", reason: "missing-target" };
    } else {
      const navForProjection =
        latestSnapshot?.totalValue ?? state.navSeries.at(-1)?.nav ?? account.seedValue;
      const asOfForProjection = latestSnapshot?.asOf?.slice(0, 10) ?? yesterdayInET();
      projection = computeProjection({
        currentNav: navForProjection,
        targetValue: account.targetValue,
        expectedRealReturn: account.expectedRealReturn,
        asOfDate: asOfForProjection,
      });
    }
```

Then in the final `return { kind: "ready", ... }`, add `projection`:

```ts
    return {
      kind: "ready",
      state,
      sourceFiles: { ... },
      loadedAt: new Date().toISOString(),
      markToMarket,
      latestSnapshot: includeMarketData ? latestSnapshot : null,
      projection,
    };
```

- [ ] **Step 4: Run the integration test**

```bash
npx vitest run tests/integration.test.ts
```

Expected: all integration tests pass (5 = 3 existing + 2 new).

- [ ] **Step 5: Run the full test suite + typecheck**

```bash
npm run test
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/server/dashboard.ts tests/integration.test.ts
git status
git commit -m "$(cat <<'EOF'
Wire projection into loadDashboard

DashboardData.ready now carries a 'projection' field — either a
ProjectionResult or 'unconfigured'. Uses latestSnapshot.totalValue as
the current NAV when available, falling back to navSeries.

Refs #16.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `ProjectionCard` component

**Files:**
- Create: `app/components/ProjectionCard.tsx`

- [ ] **Step 1: Inspect an existing card for style conventions**

```bash
ls app/components/
sed -n '1,80p' app/components/SummaryStrip.tsx
```

(Reference only — do not edit. We're matching the existing aesthetic.)

- [ ] **Step 2: Implement `app/components/ProjectionCard.tsx`**

```tsx
import type { DashboardProjection } from "@/lib/server/dashboard";

type Props = {
  projection: DashboardProjection;
  asOfDate?: string;
};

function fmtCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtPercent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtPrettyDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ProjectionCard({ projection, asOfDate }: Props) {
  const containerCls =
    "rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6";

  if (projection.kind === "unconfigured") {
    const missing = projection.reason === "missing-rate" ? "growth rate" : "target";
    return (
      <div className={containerCls}>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Projection
        </h3>
        <p className="text-gray-700 dark:text-gray-200">
          Set a {missing} to project years to freedom.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Run <code>/account-set</code> or{" "}
          <code>
            npm run account:configure -- --account=&lt;id&gt;
            --expected-real-return=0.07 --target=1000000
          </code>
          .
        </p>
      </div>
    );
  }

  if (projection.kind === "achieved") {
    return (
      <div className={containerCls}>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Projection
        </h3>
        <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Target reached.
        </p>
        <p className="text-gray-700 dark:text-gray-200">
          Current NAV {fmtCurrency(projection.currentNav)} is past target{" "}
          {fmtCurrency(projection.targetValue)}.
        </p>
      </div>
    );
  }

  if (projection.kind === "unreachable") {
    const message =
      projection.reason === "non-positive-rate"
        ? "Cannot project: rate must be positive."
        : "Cannot project: target and current NAV must be positive.";
    return (
      <div className={containerCls}>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Projection
        </h3>
        <p className="text-gray-700 dark:text-gray-200">{message}</p>
      </div>
    );
  }

  // computed
  return (
    <div className={containerCls}>
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Projection
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Years to target</p>
          <p className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
            {projection.years.toFixed(1)} years
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            at {fmtPercent(projection.rate)} real
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Reach {fmtCurrency(projection.targetValue)} by
          </p>
          <p className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
            {fmtPrettyDate(projection.targetDate)}
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
        Current NAV {fmtCurrency(projection.currentNav)}
        {asOfDate ? ` as of ${fmtPrettyDate(asOfDate)}` : ""}.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/ProjectionCard.tsx
git status
git commit -m "$(cat <<'EOF'
Add ProjectionCard component

Read-only card with four render states (unconfigured / achieved /
unreachable / computed). Matches existing card aesthetic.

Refs #16.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Render `ProjectionCard` on the main dashboard

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Inspect current `app/page.tsx`**

```bash
sed -n '1,100p' app/page.tsx
```

(Familiarize with the layout — find a sensible mid-page spot to insert the card. Aim for after the NAV chart and before the deeper-detail tables / cards. Specific placement is left to the implementer's eye; the card should be visible without scrolling on a typical viewport.)

- [ ] **Step 2: Add the import + render the card**

In `app/page.tsx`:

1. Add `import { ProjectionCard } from "@/app/components/ProjectionCard";` near other component imports.
2. In the JSX, somewhere mid-page (e.g., right after the NAV card and before further detail), render:

```tsx
<ProjectionCard
  projection={state.projection /* see step 3 — name may differ in your file */}
  asOfDate={state.latestSnapshot?.asOf?.slice(0, 10)}
/>
```

(Use `result.projection` — i.e. whatever the variable holding `loadDashboard()`'s return value is — and `result.latestSnapshot?.asOf`. Don't forget `?.slice(0, 10)` since `asOf` from the snapshot can be a longer timestamp in some paths.)

- [ ] **Step 3: Manual verification (with `npm run dev`)**

```bash
npm run dev
```

Visit `http://localhost:3000`. Expected, in order:
- If primary account has neither rate nor target → "Unconfigured" card visible.
- After `npm run account:configure -- --account=<id> --expected-real-return=0.07 --target=1000000`, refresh → "Computed" card with years + date.
- After bumping target below current NAV → "Achieved" card.
- After setting rate to 0 (just for verification, then revert) → "Unreachable" card.

- [ ] **Step 4: Run the full test suite + typecheck**

```bash
npm run test
npm run typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git status
git commit -m "$(cat <<'EOF'
Render ProjectionCard on the main dashboard

Refs #16.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `/account-set` skill

**Files:**
- Create: `.claude/skills/account-set/SKILL.md`

- [ ] **Step 1: Create the skill file**

```markdown
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
```

- [ ] **Step 2: Verify the skill is registered**

The next time Claude Code reloads its skill list, `/account-set` should appear. (No automated verification — the skill file's presence is the test.)

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/account-set/SKILL.md
git status
git commit -m "$(cat <<'EOF'
Add /account-set skill

Conversational wrapper around npm run account:configure +
account:show. Resolves account labels to <brokerage>:<id> via a small
sqlite3 query.

Refs #16.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final verification + PR

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Expected: all tests pass; the count is the previous Phase-1 count (228) plus ~15 new Phase 2 tests.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: only the pre-existing lint errors (`<a>` vs `<Link>` in `app/trades/page.tsx` / `app/transactions/page.tsx`, `mkdirSync` unused in `tests/market/quotes.test.ts`) — no new errors introduced by Phase 2.

- [ ] **Step 4: Manual end-to-end verification**

```bash
# Start with a clean DB so migrations apply fresh:
rm -f data/portfolio.db

# Re-ingest:
npm run ingest

# Configure the Demo account fully (use your real values):
npm run account:configure -- \
  --account=schwab:520 \
  --primary \
  --seed-date=YYYY-MM-DD \
  --seed-value=NNNN \
  --benchmark=SPY \
  --market-data on \
  --expected-real-return=0.07 \
  --target=1000000 \
  --group=Wheel

# Verify:
npm run account:show -- --account=schwab:520

# View the dashboard:
npm run dev
```

Expected: dashboard renders with the new ProjectionCard in the "computed" state showing years-to-target.

- [ ] **Step 5: Hygiene check**

```bash
git status
git diff main...HEAD --stat
git diff main...HEAD -- '**/*.csv' '**/*.xlsx'
git diff main...HEAD -- 'data/' 'transactions/' 'sheets/'
```

Expected:
- No staged or modified files under `data/`, `transactions/`, or `sheets/`
- No CSV/XLSX changes (no fixture additions in Phase 2)
- Clean diff

- [ ] **Step 6: Push and open PR**

```bash
git push -u origin fix/16-phase2-per-account-projections

gh pr create --title "Phase 2: Per-account projections" --body "$(cat <<'EOF'
## Summary

- Adds editable per-account metadata: `expected_real_return`, `target_value`, `account_group`.
- Adds `npm run account:configure --expected-real-return / --target / --group` flags and a new `npm run account:show` admin command for verification.
- Adds a thin `/account-set` skill that wraps the CLIs.
- Adds a pure `computeProjection()` function and a new `ProjectionCard` on the main dashboard with four states (unconfigured / achieved / unreachable / computed).
- No multi-account UI / no grouping picker — that's Phase 3 (#17).

Spec: `docs/superpowers/specs/2026-04-24-phase2-per-account-projections-design.md`
Plan: `docs/superpowers/plans/2026-04-24-phase2-per-account-projections.md`

## Test plan

- [x] `npm run test` — all passing (15 new tests for Phase 2).
- [x] `npm run typecheck` — clean.
- [x] `npm run lint` — only pre-existing errors.
- [ ] Manual: `npm run dev` and the projection card renders in each of its four states.

Use a **merge commit** (not squash) per `CLAUDE.md`.

Closes #16.

*Co-authored by Claude*
EOF
)"
```

---

## Self-review notes (writer)

**Spec coverage:**
- Schema additions (3 columns) → Task 1.
- Account type + 3 update functions → Task 2.
- `configureAccount` extension → Task 3.
- CLI flag parsing (`%` suffix + warning) → Task 4.
- `account-show` admin command → Task 5.
- `computeProjection` pure function → Task 6.
- Wire into `loadDashboard` (with current-NAV definition + asOfDate fallback) → Task 7.
- `ProjectionCard` (4 states) → Task 8.
- Render in `app/page.tsx` → Task 9.
- `/account-set` skill → Task 10.
- Final verification + PR → Task 11.

**Type consistency:** `Account` field names (`expectedRealReturn`, `targetValue`, `accountGroup`) used consistently across repo, configureAccount, accountShow, dashboard, and ProjectionCard. `ProjectionResult` and `DashboardProjection` shapes match between `lib/model/metrics/projection.ts`, `lib/server/dashboard.ts`, and `app/components/ProjectionCard.tsx`.

**No placeholders:** every code step shows the full content.

**One judgment call left to the implementer:** exact placement of `ProjectionCard` in the existing `app/page.tsx` JSX tree (Task 9). Spec acknowledges this; "mid-page" is the directional guidance.
