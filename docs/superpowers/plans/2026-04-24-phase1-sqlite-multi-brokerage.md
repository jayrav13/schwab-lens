# Phase 1: SQLite + Multi-Brokerage Ingest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the dashboard from stateless CSV parsing to a SQLite-backed data layer with a generic multi-brokerage / multi-account schema, with no UI behavior change.

**Architecture:** CSVs in `data/<brokerage>/<account>/{transactions,positions}/` remain the source of truth. `data/portfolio.db` (SQLite via `better-sqlite3`) is the queryable projection. Ingest is idempotent via per-row content hashes and `INSERT OR IGNORE`. Brokerage-specific code lives in `lib/brokerage/<slug>/` adapters; everything downstream sees canonical rows. Phase 1 ships only the Schwab adapter.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Vitest · `better-sqlite3` (new) · `papaparse` · `yahoo-finance2`

**Spec:** `docs/superpowers/specs/2026-04-24-phase1-sqlite-multi-brokerage-design.md`. **Tracking issue:** [#15](https://github.com/jayrav13/schwab-lens/issues/15).

**Branch:** continue on `fix/15-phase1-design-spec`. The PR for #15 includes both spec and implementation commits.

**Hygiene:** before every commit, run `git status` and `git diff --cached`. Verify no `*.csv` / `*.xlsx` files and no files under `transactions/`, `sheets/`, `data/` are staged. `tests/fixtures/**/*.csv` is the only exception, and those CSVs MUST be fully fictional (no real tickers from the user's portfolio, no real dollar amounts).

---

## File Structure

### New files

```
db/migrations/001-initial-schema.sql

lib/db/connect.ts
lib/db/migrate.ts
lib/db/repos/accounts.ts
lib/db/repos/transactions.ts
lib/db/repos/positionSnapshots.ts
lib/db/repos/settings.ts

lib/brokerage/types.ts
lib/brokerage/registry.ts
lib/brokerage/schwab/index.ts
lib/brokerage/schwab/filenames.ts
lib/brokerage/schwab/identify.ts
lib/brokerage/schwab/transactions.ts
lib/brokerage/schwab/positions.ts
lib/brokerage/schwab/actions.ts

lib/util/optionSymbol.ts

lib/ingest/contentHash.ts
lib/ingest/run.ts

lib/scripts/accountConfigure.ts
lib/server/dashboardSource.ts

scripts/ingest.ts
scripts/account-configure.ts
scripts/route-downloads.ts

.claude/skills/ingest/SKILL.md

tests/fixtures/schwab/Demo_XXX999_Transactions_20260105-090000.csv  (FICTIONAL)
tests/fixtures/schwab/Demo-Positions-2026-01-05-090000.csv          (FICTIONAL)
```

### Modified files

```
package.json                          # add better-sqlite3 + tsx, scripts
lib/server/dashboard.ts               # swap CSV reads for DB reads
lib/positions/seed.ts                 # chooseSeed takes seedDate/seedValue directly
app/components/OnboardingCard.tsx     # update copy
tests/integration.test.ts             # adapt to DB-backed flow
tests/positions/seed.test.ts          # adapt to new chooseSeed signature
```

### Deleted files (Task 22)

```
lib/config.ts
lib/csv/load.ts
lib/csv/parse.ts
lib/positions/load.ts
lib/positions/parse.ts
tests/config.test.ts
.claude/skills/ingest/SKILL.md
```

`lib/csv/types.ts` and `lib/positions/types.ts` are kept as the boundary between canonical (DB) and legacy (model) types — `lib/server/dashboardSource.ts` translates between the two.

---

## Task 1: Add `better-sqlite3` and DB connection helper

**Files:**
- Modify: `package.json`
- Create: `lib/db/connect.ts`
- Test: `tests/db/connect.test.ts`

- [ ] **Step 1: Install `better-sqlite3`**

```bash
npm install better-sqlite3@^11.5.0
npm install --save-dev @types/better-sqlite3@^7.6.11
```

Expected: `npm install` exits 0; `package.json` gains the dependency.

- [ ] **Step 2: Write the failing test**

Create `tests/db/connect.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db/connect";

describe("openDb", () => {
  it("opens an in-memory database that responds to a trivial query", () => {
    const db = openDb(":memory:");
    const row = db.prepare("SELECT 1 + 1 AS two").get() as { two: number };
    expect(row.two).toBe(2);
    db.close();
  });

  it("enables foreign keys by default", () => {
    const db = openDb(":memory:");
    const row = db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run tests/db/connect.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/db/connect'`.

- [ ] **Step 4: Implement `lib/db/connect.ts`**

```ts
import Database, { type Database as DbType } from "better-sqlite3";

export type Db = DbType;

export function openDb(filename: string): Db {
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  return db;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run tests/db/connect.test.ts
```

Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/db/connect.ts tests/db/connect.test.ts
git status
git commit -m "$(cat <<'EOF'
Add better-sqlite3 dep + DB connection helper

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migration runner

The runner uses `db.prepare(statement).run()` per individual SQL statement (better-sqlite3's `prepare()` requires single-statement SQL). A small splitter breaks each `.sql` file into statements on `;`.

**Files:**
- Create: `lib/db/migrate.ts`
- Test: `tests/db/migrate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/db/migrate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";

function withMigrationsDir(files: Array<{ name: string; sql: string }>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "migrate-test-"));
  const migDir = path.join(dir, "migrations");
  mkdirSync(migDir);
  for (const f of files) writeFileSync(path.join(migDir, f.name), f.sql);
  return migDir;
}

describe("runMigrations", () => {
  it("creates the migrations table on first run", () => {
    const db = openDb(":memory:");
    const migDir = withMigrationsDir([]);
    runMigrations(db, migDir);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'")
      .get();
    expect(row).toBeDefined();
  });

  it("applies a single SQL migration and records it", () => {
    const db = openDb(":memory:");
    const migDir = withMigrationsDir([
      { name: "001-create-foo.sql", sql: "CREATE TABLE foo (id INTEGER PRIMARY KEY);" },
    ]);
    runMigrations(db, migDir);

    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='foo'")
      .get();
    expect(tableExists).toBeDefined();

    const applied = db.prepare("SELECT name FROM migrations").all() as Array<{ name: string }>;
    expect(applied.map((r) => r.name)).toEqual(["001-create-foo.sql"]);
  });

  it("is idempotent (re-running applies nothing)", () => {
    const db = openDb(":memory:");
    const migDir = withMigrationsDir([
      { name: "001-create-foo.sql", sql: "CREATE TABLE foo (id INTEGER PRIMARY KEY);" },
    ]);
    runMigrations(db, migDir);
    runMigrations(db, migDir);
    const applied = db.prepare("SELECT COUNT(*) AS n FROM migrations").get() as { n: number };
    expect(applied.n).toBe(1);
  });

  it("applies migrations in lexicographic order", () => {
    const db = openDb(":memory:");
    const migDir = withMigrationsDir([
      { name: "002-create-bar.sql", sql: "CREATE TABLE bar (id INTEGER PRIMARY KEY);" },
      { name: "001-create-foo.sql", sql: "CREATE TABLE foo (id INTEGER PRIMARY KEY);" },
    ]);
    runMigrations(db, migDir);
    const applied = db.prepare("SELECT name FROM migrations ORDER BY id").all() as Array<{ name: string }>;
    expect(applied.map((r) => r.name)).toEqual(["001-create-foo.sql", "002-create-bar.sql"]);
  });

  it("handles a multi-statement migration file", () => {
    const db = openDb(":memory:");
    const migDir = withMigrationsDir([
      {
        name: "001-multi.sql",
        sql: `
          CREATE TABLE a (id INTEGER PRIMARY KEY);
          CREATE TABLE b (id INTEGER PRIMARY KEY);
          INSERT INTO a (id) VALUES (1);
        `,
      },
    ]);
    runMigrations(db, migDir);
    const aRows = db.prepare("SELECT id FROM a").all() as Array<{ id: number }>;
    const bExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='b'")
      .get();
    expect(aRows.map((r) => r.id)).toEqual([1]);
    expect(bExists).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/db/migrate.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/db/migrate.ts`**

```ts
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { Db } from "@/lib/db/connect";

const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS migrations (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )
`;

export function splitSqlStatements(sql: string): string[] {
  const stripped = sql.replace(/--[^\n]*/g, "");
  return stripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function runMigrations(db: Db, migrationsDir: string): void {
  db.prepare(CREATE_MIGRATIONS_TABLE).run();

  const files = existsSync(migrationsDir)
    ? readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort()
    : [];

  const appliedRows = db.prepare("SELECT name FROM migrations").all() as Array<{ name: string }>;
  const applied = new Set(appliedRows.map((r) => r.name));

  const insert = db.prepare(
    "INSERT INTO migrations (name, applied_at) VALUES (?, ?)",
  );

  const apply = db.transaction((file: string, sql: string) => {
    for (const stmt of splitSqlStatements(sql)) {
      db.prepare(stmt).run();
    }
    insert.run(file, new Date().toISOString());
  });

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    apply(file, sql);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/db/migrate.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/db/migrate.ts tests/db/migrate.test.ts
git status
git commit -m "$(cat <<'EOF'
Add SQLite migration runner

Applies SQL migration files in lexicographic order, tracks applied
migrations in a migrations table, and is idempotent on re-runs.
Multi-statement files are split on ';' and run as a single transaction.

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Initial schema migration

**Files:**
- Create: `db/migrations/001-initial-schema.sql`
- Test: extend `tests/db/migrate.test.ts`

- [ ] **Step 1: Append the failing test to `tests/db/migrate.test.ts`**

Append at the end of the file:

```ts
describe("runMigrations against db/migrations/", () => {
  it("creates all expected tables and seeds brokerages", () => {
    const db = openDb(":memory:");
    runMigrations(db, path.join(process.cwd(), "db", "migrations"));

    const tables = (db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>).map((r) => r.name);

    for (const t of [
      "accounts",
      "brokerages",
      "migrations",
      "position_snapshots",
      "settings",
      "transactions",
    ]) {
      expect(tables).toContain(t);
    }

    const brokerages = (db
      .prepare("SELECT slug FROM brokerages ORDER BY slug")
      .all() as Array<{ slug: string }>).map((r) => r.slug);
    expect(brokerages).toEqual(["chase", "fidelity", "robinhood", "schwab"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/db/migrate.test.ts
```

Expected: FAIL — migration directory empty / tables not created.

- [ ] **Step 3: Create `db/migrations/001-initial-schema.sql`**

```sql
-- Phase 1 initial schema. See spec at
-- docs/superpowers/specs/2026-04-24-phase1-sqlite-multi-brokerage-design.md

CREATE TABLE brokerages (
  slug         TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE accounts (
  id             INTEGER PRIMARY KEY,
  brokerage_slug TEXT NOT NULL REFERENCES brokerages(slug),
  external_id    TEXT NOT NULL,
  label          TEXT NOT NULL,
  seed_date      TEXT,
  seed_value     REAL,
  benchmark      TEXT,
  first_seen_at  TEXT NOT NULL,
  last_seen_at   TEXT NOT NULL,
  UNIQUE(brokerage_slug, external_id)
);

CREATE TABLE transactions (
  id               INTEGER PRIMARY KEY,
  account_id       INTEGER NOT NULL REFERENCES accounts(id),
  trade_date       TEXT NOT NULL,
  action_canonical TEXT NOT NULL,
  action_raw       TEXT NOT NULL,
  symbol           TEXT,
  description      TEXT,
  quantity         REAL,
  price            REAL,
  fees             REAL,
  amount           REAL NOT NULL,
  raw              TEXT NOT NULL,
  source_file      TEXT NOT NULL,
  content_hash     TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_tx_account_date   ON transactions(account_id, trade_date);

CREATE INDEX idx_tx_account_action ON transactions(account_id, action_canonical);

CREATE TABLE position_snapshots (
  id           INTEGER PRIMARY KEY,
  account_id   INTEGER NOT NULL REFERENCES accounts(id),
  as_of        TEXT NOT NULL,
  symbol       TEXT NOT NULL,
  description  TEXT,
  quantity     REAL,
  price        REAL,
  market_value REAL,
  cost_basis   REAL,
  asset_type   TEXT,
  raw          TEXT NOT NULL,
  source_file  TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_pos_account_asof   ON position_snapshots(account_id, as_of);

CREATE INDEX idx_pos_account_symbol ON position_snapshots(account_id, symbol, as_of);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO brokerages (slug, display_name, created_at) VALUES ('schwab',    'Charles Schwab',    '2026-04-24T00:00:00Z');

INSERT INTO brokerages (slug, display_name, created_at) VALUES ('robinhood', 'Robinhood',         '2026-04-24T00:00:00Z');

INSERT INTO brokerages (slug, display_name, created_at) VALUES ('chase',     'JPM Self-Directed', '2026-04-24T00:00:00Z');

INSERT INTO brokerages (slug, display_name, created_at) VALUES ('fidelity',  'Fidelity',          '2026-04-24T00:00:00Z');
```

(Each INSERT is its own statement so the splitter handles them cleanly.)

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/db/migrate.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/001-initial-schema.sql tests/db/migrate.test.ts
git status
git commit -m "$(cat <<'EOF'
Add initial schema migration (001)

Creates brokerages, accounts, transactions, position_snapshots, and
settings tables; seeds the brokerages table with the four supported
brokerages.

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Brokerage interface types

**Files:**
- Create: `lib/brokerage/types.ts`

Type-only file; verification is via `tsc --noEmit` and consumer tasks.

- [ ] **Step 1: Create `lib/brokerage/types.ts`**

```ts
export type CanonicalAction =
  | "BUY"
  | "SELL"
  | "BUY_TO_OPEN"
  | "SELL_TO_OPEN"
  | "BUY_TO_CLOSE"
  | "SELL_TO_CLOSE"
  | "ASSIGNMENT"
  | "EXERCISE"
  | "EXPIRATION"
  | "DIVIDEND"
  | "INTEREST"
  | "FEE"
  | "JOURNAL"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "UNKNOWN";

export const ALL_CANONICAL_ACTIONS: ReadonlyArray<CanonicalAction> = [
  "BUY",
  "SELL",
  "BUY_TO_OPEN",
  "SELL_TO_OPEN",
  "BUY_TO_CLOSE",
  "SELL_TO_CLOSE",
  "ASSIGNMENT",
  "EXERCISE",
  "EXPIRATION",
  "DIVIDEND",
  "INTEREST",
  "FEE",
  "JOURNAL",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "UNKNOWN",
] as const;

export type AssetType = "equity" | "option" | "cash";

export type ParseInput = {
  filepath: string;
  content: string;
};

export type CanonicalTransaction = {
  tradeDate: string;
  actionCanonical: CanonicalAction;
  actionRaw: string;
  symbol: string | null;
  description: string | null;
  quantity: number | null;
  price: number | null;
  fees: number | null;
  amount: number;
  raw: Record<string, unknown>;
};

export type CanonicalPositionSnapshot = {
  asOf: string;
  symbol: string;
  description: string | null;
  quantity: number | null;
  price: number | null;
  marketValue: number | null;
  costBasis: number | null;
  assetType: AssetType | null;
  raw: Record<string, unknown>;
};

export type AccountIdentity = {
  externalId: string;
  label: string;
};

export interface Brokerage {
  slug: string;
  displayName: string;
  filenamePatterns: {
    transactions: RegExp[];
    positions: RegExp[];
  };
  identify(input: ParseInput): AccountIdentity;
  parseTransactions(input: ParseInput): CanonicalTransaction[];
  parsePositions(input: ParseInput): CanonicalPositionSnapshot[];
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/brokerage/types.ts
git status
git commit -m "$(cat <<'EOF'
Add brokerage adapter type interface

Canonical row shapes, action enum, and Brokerage interface that every
adapter implements.

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Schwab filename patterns

**Files:**
- Create: `lib/brokerage/schwab/filenames.ts`
- Test: `tests/brokerage/schwab/filenames.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/brokerage/schwab/filenames.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  TRANSACTIONS_PATTERNS,
  POSITIONS_PATTERNS,
  classifyFilename,
} from "@/lib/brokerage/schwab/filenames";

describe("Schwab filename patterns", () => {
  it("matches a typical transactions filename", () => {
    expect(
      TRANSACTIONS_PATTERNS.some((re) =>
        re.test("Demo_XXX999_Transactions_20260101-090000.csv"),
      ),
    ).toBe(true);
  });

  it("matches a typical positions filename", () => {
    expect(
      POSITIONS_PATTERNS.some((re) =>
        re.test("Demo-Positions-2026-01-15-090000.csv"),
      ),
    ).toBe(true);
  });

  it("does not match the wrong type", () => {
    expect(
      TRANSACTIONS_PATTERNS.some((re) =>
        re.test("Demo-Positions-2026-01-15-090000.csv"),
      ),
    ).toBe(false);
    expect(
      POSITIONS_PATTERNS.some((re) =>
        re.test("Demo_XXX999_Transactions_20260101-090000.csv"),
      ),
    ).toBe(false);
  });

  it("classifyFilename returns 'transactions' / 'positions' / null", () => {
    expect(classifyFilename("Demo_XXX999_Transactions_20260101-090000.csv"))
      .toBe("transactions");
    expect(classifyFilename("Demo-Positions-2026-01-15-090000.csv"))
      .toBe("positions");
    expect(classifyFilename("randomexport.csv")).toBeNull();
  });

  it("classifyFilename uses basename, not full path", () => {
    expect(classifyFilename("/x/y/Demo_XXX999_Transactions_20260101-090000.csv"))
      .toBe("transactions");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/brokerage/schwab/filenames.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/brokerage/schwab/filenames.ts`**

```ts
import path from "node:path";

export const TRANSACTIONS_PATTERNS: RegExp[] = [
  /^.+_XXX\d{3}_Transactions_\d{8}-\d{6}\.csv$/,
];

export const POSITIONS_PATTERNS: RegExp[] = [
  /^.+-Positions-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/,
];

export function classifyFilename(
  filenameOrPath: string,
): "transactions" | "positions" | null {
  const base = path.basename(filenameOrPath);
  if (TRANSACTIONS_PATTERNS.some((re) => re.test(base))) return "transactions";
  if (POSITIONS_PATTERNS.some((re) => re.test(base))) return "positions";
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/brokerage/schwab/filenames.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/brokerage/schwab/filenames.ts tests/brokerage/schwab/filenames.test.ts
git status
git commit -m "$(cat <<'EOF'
Add Schwab filename pattern recognition

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Schwab action mapping

**Files:**
- Create: `lib/brokerage/schwab/actions.ts`
- Test: `tests/brokerage/schwab/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/brokerage/schwab/actions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapSchwabAction } from "@/lib/brokerage/schwab/actions";

describe("mapSchwabAction", () => {
  it("maps known direct actions", () => {
    expect(mapSchwabAction("Buy")).toBe("BUY");
    expect(mapSchwabAction("Sell")).toBe("SELL");
    expect(mapSchwabAction("Buy to Open")).toBe("BUY_TO_OPEN");
    expect(mapSchwabAction("Sell to Open")).toBe("SELL_TO_OPEN");
    expect(mapSchwabAction("Buy to Close")).toBe("BUY_TO_CLOSE");
    expect(mapSchwabAction("Sell to Close")).toBe("SELL_TO_CLOSE");
    expect(mapSchwabAction("Assigned")).toBe("ASSIGNMENT");
    expect(mapSchwabAction("Exercised")).toBe("EXERCISE");
    expect(mapSchwabAction("Expired")).toBe("EXPIRATION");
    expect(mapSchwabAction("Qualified Dividend")).toBe("DIVIDEND");
    expect(mapSchwabAction("Bank Interest")).toBe("INTEREST");
    expect(mapSchwabAction("Credit Interest")).toBe("INTEREST");
    expect(mapSchwabAction("Journal")).toBe("JOURNAL");
    expect(mapSchwabAction("Wire Sent")).toBe("TRANSFER_OUT");
    expect(mapSchwabAction("Service Fee")).toBe("FEE");
    expect(mapSchwabAction("MoneyLink Deposit")).toBe("TRANSFER_IN");
  });

  it("uses sign-based fallback for ambiguous transfers", () => {
    expect(mapSchwabAction("MoneyLink Transfer", 100)).toBe("TRANSFER_IN");
    expect(mapSchwabAction("MoneyLink Transfer", -100)).toBe("TRANSFER_OUT");
    expect(mapSchwabAction("MoneyLink Transfer", 0)).toBe("TRANSFER_IN");
  });

  it("returns UNKNOWN for unmapped actions", () => {
    expect(mapSchwabAction("Some Future Action")).toBe("UNKNOWN");
    expect(mapSchwabAction("")).toBe("UNKNOWN");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/brokerage/schwab/actions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/brokerage/schwab/actions.ts`**

```ts
import type { CanonicalAction } from "@/lib/brokerage/types";

const DIRECT_MAP: Record<string, CanonicalAction> = {
  "Buy": "BUY",
  "Sell": "SELL",
  "Buy to Open": "BUY_TO_OPEN",
  "Sell to Open": "SELL_TO_OPEN",
  "Buy to Close": "BUY_TO_CLOSE",
  "Sell to Close": "SELL_TO_CLOSE",
  "Assigned": "ASSIGNMENT",
  "Exercised": "EXERCISE",
  "Expired": "EXPIRATION",
  "Qualified Dividend": "DIVIDEND",
  "Cash Dividend": "DIVIDEND",
  "Bank Interest": "INTEREST",
  "Credit Interest": "INTEREST",
  "Margin Interest": "INTEREST",
  "Journal": "JOURNAL",
  "Wire Sent": "TRANSFER_OUT",
  "Wire Received": "TRANSFER_IN",
  "MoneyLink Deposit": "TRANSFER_IN",
  "MoneyLink Withdrawal": "TRANSFER_OUT",
  "Service Fee": "FEE",
  "ADR Fee": "FEE",
  "Misc Cash Entry": "JOURNAL",
};

export function mapSchwabAction(
  rawAction: string,
  amount?: number,
): CanonicalAction {
  const direct = DIRECT_MAP[rawAction];
  if (direct) return direct;

  if (/^MoneyLink/.test(rawAction) || /Transfer/i.test(rawAction)) {
    if (amount === undefined || amount >= 0) return "TRANSFER_IN";
    return "TRANSFER_OUT";
  }

  return "UNKNOWN";
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/brokerage/schwab/actions.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/brokerage/schwab/actions.ts tests/brokerage/schwab/actions.test.ts
git status
git commit -m "$(cat <<'EOF'
Add Schwab action → canonical action mapping

Direct mapping for known action strings; sign-based disambiguation for
MoneyLink/Transfer rows; UNKNOWN as the safe fallback so ingest remains
robust to new action types.

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Schwab account identity extraction

**Files:**
- Create: `lib/brokerage/schwab/identify.ts`
- Test: `tests/brokerage/schwab/identify.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/brokerage/schwab/identify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  identifyFromTransactionsFilename,
  identifyFromPositionsContent,
  identifySchwab,
} from "@/lib/brokerage/schwab/identify";

describe("identifyFromTransactionsFilename", () => {
  it("extracts label and externalId", () => {
    expect(identifyFromTransactionsFilename("Demo_XXX999_Transactions_20260101-090000.csv"))
      .toEqual({ label: "Demo", externalId: "999" });
  });

  it("works with a path", () => {
    expect(identifyFromTransactionsFilename("/x/y/Demo_XXX999_Transactions_20260101-090000.csv"))
      .toEqual({ label: "Demo", externalId: "999" });
  });

  it("returns null for non-matching name", () => {
    expect(identifyFromTransactionsFilename("foo.csv")).toBeNull();
  });
});

describe("identifyFromPositionsContent", () => {
  it("parses label + externalId from first-line header", () => {
    const content = `"Positions for account Demo ...999 as of 09:00 AM ET, 2026/01/01"\n\n"Symbol",...`;
    expect(identifyFromPositionsContent(content)).toEqual({
      label: "Demo",
      externalId: "999",
    });
  });

  it("supports multi-word labels", () => {
    const content = `"Positions for account Wheel Account ...123 as of 09:00 AM ET, 2026/01/01"\n`;
    expect(identifyFromPositionsContent(content)).toEqual({
      label: "Wheel Account",
      externalId: "123",
    });
  });

  it("returns null when first line does not match", () => {
    expect(identifyFromPositionsContent("not a positions file")).toBeNull();
  });
});

describe("identifySchwab", () => {
  it("dispatches on filename for transactions", () => {
    expect(
      identifySchwab({
        filepath: "Demo_XXX999_Transactions_20260101-090000.csv",
        content: "Date,Action,Symbol\n",
      }),
    ).toEqual({ label: "Demo", externalId: "999" });
  });

  it("dispatches on content for positions", () => {
    expect(
      identifySchwab({
        filepath: "Demo-Positions-2026-01-15-090000.csv",
        content: `"Positions for account Demo ...999 as of 09:00 AM ET, 2026/01/01"\n`,
      }),
    ).toEqual({ label: "Demo", externalId: "999" });
  });

  it("throws on unrecognized file shape", () => {
    expect(() =>
      identifySchwab({ filepath: "weird.csv", content: "blah" }),
    ).toThrow(/Schwab/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/brokerage/schwab/identify.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/brokerage/schwab/identify.ts`**

```ts
import path from "node:path";
import type { AccountIdentity, ParseInput } from "@/lib/brokerage/types";
import { classifyFilename } from "@/lib/brokerage/schwab/filenames";

const TX_FILENAME = /^(.+)_XXX(\d{3})_Transactions_\d{8}-\d{6}\.csv$/;
const POS_HEADER = /Positions for account (.+?)\s*\.\.\.(\d{3})\s+as of/i;

export function identifyFromTransactionsFilename(
  filepathOrName: string,
): AccountIdentity | null {
  const base = path.basename(filepathOrName);
  const m = base.match(TX_FILENAME);
  if (!m) return null;
  return { label: m[1], externalId: m[2] };
}

export function identifyFromPositionsContent(
  content: string,
): AccountIdentity | null {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const m = firstLine.match(POS_HEADER);
  if (!m) return null;
  return { label: m[1].trim(), externalId: m[2] };
}

export function identifySchwab(input: ParseInput): AccountIdentity {
  const kind = classifyFilename(input.filepath);
  if (kind === "transactions") {
    const id = identifyFromTransactionsFilename(input.filepath);
    if (!id) {
      throw new Error(
        `identifySchwab: filename matched Transactions pattern but yielded no identity: ${input.filepath}`,
      );
    }
    return id;
  }
  if (kind === "positions") {
    const id = identifyFromPositionsContent(input.content);
    if (!id) {
      throw new Error(
        `identifySchwab: positions content does not contain a recognizable header: ${input.filepath}`,
      );
    }
    return id;
  }
  throw new Error(
    `identifySchwab: not a recognizable Schwab file: ${input.filepath}`,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/brokerage/schwab/identify.test.ts
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/brokerage/schwab/identify.ts tests/brokerage/schwab/identify.test.ts
git status
git commit -m "$(cat <<'EOF'
Add Schwab account identity extraction

Pulls externalId + label from Transactions filename or Positions
first-line header. Throws on unrecognized files so misrouted CSVs fail
loud.

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Schwab transactions parser

**Files:**
- Create: `lib/brokerage/schwab/transactions.ts`
- Test: `tests/brokerage/schwab/transactions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/brokerage/schwab/transactions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSchwabTransactions } from "@/lib/brokerage/schwab/transactions";

const SAMPLE = `"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"01/02/2026","Sell to Open","FAKE 01/09/2026 10.00 P","PUT FAKE EXP 01/09/26","1","$1.00","$0.66","$99.34"
"01/03/2026","Journal","","MoneyLink Deposit","","","","$5,000.00"
"01/04/2026","Buy","FAKE","FAKE INC","10","$50.00","$0.00","-$500.00"
`;

const INPUT = {
  filepath: "Demo_XXX999_Transactions_20260105-000000.csv",
  content: SAMPLE,
};

describe("parseSchwabTransactions", () => {
  it("returns one canonical row per CSV row", () => {
    expect(parseSchwabTransactions(INPUT)).toHaveLength(3);
  });

  it("normalizes dates to YYYY-MM-DD", () => {
    const rows = parseSchwabTransactions(INPUT);
    expect(rows.map((r) => r.tradeDate)).toEqual([
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
  });

  it("maps action to canonical and preserves actionRaw", () => {
    const rows = parseSchwabTransactions(INPUT);
    expect(rows[0].actionCanonical).toBe("SELL_TO_OPEN");
    expect(rows[0].actionRaw).toBe("Sell to Open");
    expect(rows[1].actionCanonical).toBe("JOURNAL");
    expect(rows[2].actionCanonical).toBe("BUY");
  });

  it("parses signed amounts", () => {
    const rows = parseSchwabTransactions(INPUT);
    expect(rows[0].amount).toBe(99.34);
    expect(rows[1].amount).toBe(5000);
    expect(rows[2].amount).toBe(-500);
  });

  it("preserves the original CSV row in raw", () => {
    const rows = parseSchwabTransactions(INPUT);
    expect(rows[1].raw).toMatchObject({
      Date: "01/03/2026",
      Action: "Journal",
      Description: "MoneyLink Deposit",
    });
  });

  it("symbol is null when CSV cell is empty", () => {
    const rows = parseSchwabTransactions(INPUT);
    expect(rows[1].symbol).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/brokerage/schwab/transactions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/brokerage/schwab/transactions.ts`**

```ts
import Papa from "papaparse";
import { parseCurrency } from "@/lib/util/money";
import { parseTradeDate } from "@/lib/util/dates";
import type { CanonicalTransaction, ParseInput } from "@/lib/brokerage/types";
import { mapSchwabAction } from "@/lib/brokerage/schwab/actions";

type RawRow = {
  Date: string;
  Action: string;
  Symbol: string;
  Description: string;
  Quantity: string;
  Price: string;
  "Fees & Comm": string;
  Amount: string;
};

export function parseSchwabTransactions(
  input: ParseInput,
): CanonicalTransaction[] {
  const result = Papa.parse<RawRow>(input.content.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(
      `parseSchwabTransactions: CSV parse error at row ${first.row}: ${first.message}`,
    );
  }
  return result.data.map((raw, idx): CanonicalTransaction => {
    try {
      const amount = parseCurrency(raw.Amount);
      const fees = parseCurrency(raw["Fees & Comm"]);
      const quantity = raw.Quantity ? Number(raw.Quantity) : null;
      const price = raw.Price ? parseCurrency(raw.Price) : null;
      return {
        tradeDate: parseTradeDate(raw.Date),
        actionCanonical: mapSchwabAction(raw.Action, amount),
        actionRaw: raw.Action,
        symbol: raw.Symbol ? raw.Symbol : null,
        description: raw.Description ? raw.Description : null,
        quantity,
        price,
        fees,
        amount,
        raw: { ...raw } as Record<string, unknown>,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `parseSchwabTransactions: row ${idx + 2}: ${msg} — raw: ${JSON.stringify(raw)}`,
      );
    }
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/brokerage/schwab/transactions.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/brokerage/schwab/transactions.ts tests/brokerage/schwab/transactions.test.ts
git status
git commit -m "$(cat <<'EOF'
Add Schwab transactions parser (canonical output)

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Schwab positions parser

**Files:**
- Create: `lib/brokerage/schwab/positions.ts`
- Test: `tests/brokerage/schwab/positions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/brokerage/schwab/positions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSchwabPositions } from "@/lib/brokerage/schwab/positions";

const SAMPLE = `"Positions for account Demo ...999 as of 09:00 AM ET, 2026/01/05"

"Symbol","Description","Qty (Quantity)","Price","Mkt Val (Market Value)","Cost Basis","Asset Type"
"FAKE","FAKE INC","10","$55.00","$550.00","$500.00","Equity"
"FAKE 01/09/2026 10.00 P","PUT FAKE EXP 01/09/26","-1","$0.50","-$50.00","--","Option"
"Cash & Cash Investments","","","","$4,500.00","","Cash"
"Account Total","","","","$5,000.00","","--"
`;

const INPUT = {
  filepath: "Demo-Positions-2026-01-05-090000.csv",
  content: SAMPLE,
};

describe("parseSchwabPositions", () => {
  it("returns canonical rows with correct as_of (YYYY-MM-DD)", () => {
    const rows = parseSchwabPositions(INPUT);
    for (const r of rows) expect(r.asOf).toBe("2026-01-05");
  });

  it("emits one row per position line; skips totals", () => {
    const rows = parseSchwabPositions(INPUT);
    expect(rows.map((r) => r.symbol)).toEqual([
      "FAKE",
      "FAKE 01/09/2026 10.00 P",
      "Cash & Cash Investments",
    ]);
  });

  it("classifies asset types", () => {
    const rows = parseSchwabPositions(INPUT);
    expect(rows[0].assetType).toBe("equity");
    expect(rows[1].assetType).toBe("option");
    expect(rows[2].assetType).toBe("cash");
  });

  it("parses signed market values", () => {
    const rows = parseSchwabPositions(INPUT);
    expect(rows[0].marketValue).toBe(550);
    expect(rows[1].marketValue).toBe(-50);
    expect(rows[2].marketValue).toBe(4500);
  });

  it("preserves raw row data", () => {
    const rows = parseSchwabPositions(INPUT);
    expect(rows[0].raw).toMatchObject({ Symbol: "FAKE", "Asset Type": "Equity" });
  });

  it("throws when first line is not a Schwab Positions header", () => {
    expect(() =>
      parseSchwabPositions({ filepath: "x.csv", content: "not a header\n\nSymbol\n" }),
    ).toThrow(/as of/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/brokerage/schwab/positions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/brokerage/schwab/positions.ts`**

```ts
import Papa from "papaparse";
import { parseCurrency } from "@/lib/util/money";
import type {
  CanonicalPositionSnapshot,
  AssetType,
  ParseInput,
} from "@/lib/brokerage/types";

const ASOF_REGEX =
  /as of\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s+ET,\s+(\d{4})\/(\d{2})\/(\d{2})/i;

function parseAsOf(headerLine: string): string {
  const m = headerLine.match(ASOF_REGEX);
  if (!m) {
    throw new Error(
      `parseSchwabPositions: cannot parse "as of" timestamp from header: ${headerLine}`,
    );
  }
  const [, yyyy, mo, dd] = m;
  return `${yyyy}-${mo}-${dd}`;
}

function parseNumeric(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "--" || trimmed === "N/A") return null;
  if (trimmed.includes("$")) return parseCurrency(trimmed);
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function classifyAssetType(raw: string | undefined): AssetType | null {
  switch ((raw ?? "").trim()) {
    case "Equity": return "equity";
    case "Option": return "option";
    case "Cash":   return "cash";
    default:       return null;
  }
}

const SKIP_SYMBOLS = new Set(["Account Total", "Positions Total"]);

export function parseSchwabPositions(
  input: ParseInput,
): CanonicalPositionSnapshot[] {
  const lines = input.content.replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 3) {
    throw new Error("parseSchwabPositions: file too short to be a Positions CSV");
  }
  const asOf = parseAsOf(lines[0]);
  const dataSection = lines.slice(2).join("\n").trim();

  const result = Papa.parse<Record<string, string>>(dataSection, {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(
      `parseSchwabPositions: CSV parse error at row ${first.row}: ${first.message}`,
    );
  }

  const out: CanonicalPositionSnapshot[] = [];
  for (const row of result.data) {
    const symbol = (row["Symbol"] ?? "").trim();
    if (symbol === "" || SKIP_SYMBOLS.has(symbol)) continue;
    out.push({
      asOf,
      symbol,
      description: row["Description"] ? row["Description"] : null,
      quantity: parseNumeric(row["Qty (Quantity)"]),
      price: parseNumeric(row["Price"]),
      marketValue: parseNumeric(row["Mkt Val (Market Value)"]),
      costBasis: parseNumeric(row["Cost Basis"]),
      assetType: classifyAssetType(row["Asset Type"]),
      raw: { ...row } as Record<string, unknown>,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/brokerage/schwab/positions.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/brokerage/schwab/positions.ts tests/brokerage/schwab/positions.test.ts
git status
git commit -m "$(cat <<'EOF'
Add Schwab positions parser (canonical output)

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Schwab adapter assembly + brokerage registry

**Files:**
- Create: `lib/brokerage/schwab/index.ts`
- Create: `lib/brokerage/registry.ts`
- Test: `tests/brokerage/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/brokerage/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { brokerages, findBrokerage, routeFile } from "@/lib/brokerage/registry";

describe("registry", () => {
  it("contains the schwab adapter", () => {
    expect(brokerages.map((b) => b.slug)).toContain("schwab");
  });

  it("findBrokerage returns the adapter by slug", () => {
    expect(findBrokerage("schwab")?.slug).toBe("schwab");
    expect(findBrokerage("does-not-exist")).toBeNull();
  });

  it("routeFile returns brokerage + kind for a transactions filename", () => {
    expect(routeFile("Demo_XXX999_Transactions_20260101-090000.csv")).toEqual({
      brokerage: expect.objectContaining({ slug: "schwab" }),
      kind: "transactions",
    });
  });

  it("routeFile returns brokerage + kind for a positions filename", () => {
    expect(routeFile("Demo-Positions-2026-01-15-090000.csv")).toEqual({
      brokerage: expect.objectContaining({ slug: "schwab" }),
      kind: "positions",
    });
  });

  it("routeFile returns null for unrecognized filenames", () => {
    expect(routeFile("random.csv")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/brokerage/registry.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/brokerage/schwab/index.ts`**

```ts
import type { Brokerage } from "@/lib/brokerage/types";
import { TRANSACTIONS_PATTERNS, POSITIONS_PATTERNS } from "@/lib/brokerage/schwab/filenames";
import { identifySchwab } from "@/lib/brokerage/schwab/identify";
import { parseSchwabTransactions } from "@/lib/brokerage/schwab/transactions";
import { parseSchwabPositions } from "@/lib/brokerage/schwab/positions";

export const schwab: Brokerage = {
  slug: "schwab",
  displayName: "Charles Schwab",
  filenamePatterns: {
    transactions: TRANSACTIONS_PATTERNS,
    positions: POSITIONS_PATTERNS,
  },
  identify: identifySchwab,
  parseTransactions: parseSchwabTransactions,
  parsePositions: parseSchwabPositions,
};
```

- [ ] **Step 4: Implement `lib/brokerage/registry.ts`**

```ts
import path from "node:path";
import type { Brokerage } from "@/lib/brokerage/types";
import { schwab } from "@/lib/brokerage/schwab";

export const brokerages: Brokerage[] = [schwab];

export function findBrokerage(slug: string): Brokerage | null {
  return brokerages.find((b) => b.slug === slug) ?? null;
}

export function routeFile(
  filenameOrPath: string,
): { brokerage: Brokerage; kind: "transactions" | "positions" } | null {
  const base = path.basename(filenameOrPath);
  for (const b of brokerages) {
    if (b.filenamePatterns.transactions.some((re) => re.test(base))) {
      return { brokerage: b, kind: "transactions" };
    }
    if (b.filenamePatterns.positions.some((re) => re.test(base))) {
      return { brokerage: b, kind: "positions" };
    }
  }
  return null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run tests/brokerage/registry.test.ts
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add lib/brokerage/schwab/index.ts lib/brokerage/registry.ts tests/brokerage/registry.test.ts
git status
git commit -m "$(cat <<'EOF'
Add Schwab adapter assembly + brokerage registry

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Accounts repo

**Files:**
- Create: `lib/db/repos/accounts.ts`
- Test: `tests/db/repos/accounts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/db/repos/accounts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import {
  upsertAccount,
  getAccountByExternal,
  listAccounts,
  updateAccountSeed,
  updateAccountLabel,
  updateAccountBenchmark,
} from "@/lib/db/repos/accounts";

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("accounts repo", () => {
  it("upsertAccount inserts a new account row", () => {
    const db = freshDb();
    const id = upsertAccount(db, {
      brokerageSlug: "schwab",
      externalId: "999",
      label: "Test",
    });
    expect(id).toBeGreaterThan(0);
    const got = getAccountByExternal(db, "schwab", "999");
    expect(got).toMatchObject({ brokerageSlug: "schwab", externalId: "999", label: "Test" });
    expect(got?.firstSeenAt).toBeTruthy();
    expect(got?.lastSeenAt).toBeTruthy();
  });

  it("upsertAccount on an existing row updates label + last_seen_at, keeps first_seen_at", () => {
    const db = freshDb();
    upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "First", now: "2026-01-15T00:00:00Z" });
    const before = getAccountByExternal(db, "schwab", "999");
    upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "Updated", now: "2026-01-02T00:00:00Z" });
    const after = getAccountByExternal(db, "schwab", "999");
    expect(after?.label).toBe("Updated");
    expect(after?.firstSeenAt).toBe(before?.firstSeenAt);
    expect(after?.lastSeenAt).not.toBe(before?.lastSeenAt);
  });

  it("listAccounts returns all rows", () => {
    const db = freshDb();
    upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "A" });
    upsertAccount(db, { brokerageSlug: "schwab", externalId: "888", label: "B" });
    expect(listAccounts(db)).toHaveLength(2);
  });

  it("updateAccountSeed sets seed_date and seed_value", () => {
    const db = freshDb();
    const id = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "A" });
    updateAccountSeed(db, id, "2026-01-15", 1234.56);
    const got = getAccountByExternal(db, "schwab", "999");
    expect(got?.seedDate).toBe("2026-01-15");
    expect(got?.seedValue).toBe(1234.56);
  });

  it("updateAccountLabel and updateAccountBenchmark set those columns", () => {
    const db = freshDb();
    const id = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "A" });
    updateAccountLabel(db, id, "Renamed");
    updateAccountBenchmark(db, id, "SPY");
    const got = getAccountByExternal(db, "schwab", "999");
    expect(got?.label).toBe("Renamed");
    expect(got?.benchmark).toBe("SPY");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/db/repos/accounts.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/db/repos/accounts.ts`**

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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/db/repos/accounts.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/db/repos/accounts.ts tests/db/repos/accounts.test.ts
git status
git commit -m "$(cat <<'EOF'
Add accounts repo (upsert + lookups + setters)

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Transactions repo

**Files:**
- Create: `lib/db/repos/transactions.ts`
- Test: `tests/db/repos/transactions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/db/repos/transactions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import {
  insertTransactions,
  listTransactionsByAccount,
  countDistinctUnknownActions,
} from "@/lib/db/repos/transactions";

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

const SAMPLE_ROW = {
  tradeDate: "2026-01-02",
  actionCanonical: "SELL_TO_OPEN" as const,
  actionRaw: "Sell to Open",
  symbol: "FAKE 01/09/2026 10.00 P",
  description: "PUT FAKE EXP 01/09/26",
  quantity: 1,
  price: 1,
  fees: 0.66,
  amount: 99.34,
  raw: { Date: "01/02/2026", Action: "Sell to Open" } as Record<string, unknown>,
  sourceFile: "Demo_XXX999_Transactions_20260105-000000.csv",
  contentHash: "tx-hash-1",
};

describe("transactions repo", () => {
  it("inserts new rows and returns the count inserted", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    expect(insertTransactions(db, accountId, [SAMPLE_ROW])).toEqual({ inserted: 1, skipped: 0 });
  });

  it("re-inserting the same content_hash is a no-op", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    insertTransactions(db, accountId, [SAMPLE_ROW]);
    expect(insertTransactions(db, accountId, [SAMPLE_ROW])).toEqual({ inserted: 0, skipped: 1 });
  });

  it("listTransactionsByAccount returns rows ordered by trade_date", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    insertTransactions(db, accountId, [
      { ...SAMPLE_ROW, tradeDate: "2026-01-04", contentHash: "h-3" },
      { ...SAMPLE_ROW, tradeDate: "2026-01-02", contentHash: "h-1" },
      { ...SAMPLE_ROW, tradeDate: "2026-01-03", contentHash: "h-2" },
    ]);
    const txs = listTransactionsByAccount(db, accountId);
    expect(txs.map((t) => t.tradeDate)).toEqual(["2026-01-02", "2026-01-03", "2026-01-04"]);
  });

  it("countDistinctUnknownActions tallies UNKNOWN action_raw counts", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    insertTransactions(db, accountId, [
      { ...SAMPLE_ROW, actionCanonical: "UNKNOWN", actionRaw: "Mystery", contentHash: "h-1" },
      { ...SAMPLE_ROW, actionCanonical: "UNKNOWN", actionRaw: "Mystery", contentHash: "h-2" },
      { ...SAMPLE_ROW, actionCanonical: "UNKNOWN", actionRaw: "Other",   contentHash: "h-3" },
    ]);
    expect(countDistinctUnknownActions(db)).toEqual([
      { actionRaw: "Mystery", count: 2 },
      { actionRaw: "Other", count: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/db/repos/transactions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/db/repos/transactions.ts`**

```ts
import type { Db } from "@/lib/db/connect";
import type { CanonicalTransaction } from "@/lib/brokerage/types";

export type StoredTransaction = CanonicalTransaction & {
  id: number;
  accountId: number;
  sourceFile: string;
  contentHash: string;
};

export type InsertableTransaction = CanonicalTransaction & {
  sourceFile: string;
  contentHash: string;
};

type TxRow = {
  id: number;
  account_id: number;
  trade_date: string;
  action_canonical: string;
  action_raw: string;
  symbol: string | null;
  description: string | null;
  quantity: number | null;
  price: number | null;
  fees: number | null;
  amount: number;
  raw: string;
  source_file: string;
  content_hash: string;
};

function rowToStored(r: TxRow): StoredTransaction {
  return {
    id: r.id,
    accountId: r.account_id,
    tradeDate: r.trade_date,
    actionCanonical: r.action_canonical as StoredTransaction["actionCanonical"],
    actionRaw: r.action_raw,
    symbol: r.symbol,
    description: r.description,
    quantity: r.quantity,
    price: r.price,
    fees: r.fees,
    amount: r.amount,
    raw: JSON.parse(r.raw),
    sourceFile: r.source_file,
    contentHash: r.content_hash,
  };
}

export function insertTransactions(
  db: Db,
  accountId: number,
  rows: InsertableTransaction[],
): { inserted: number; skipped: number } {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO transactions (
      account_id, trade_date, action_canonical, action_raw,
      symbol, description, quantity, price, fees, amount,
      raw, source_file, content_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  let skipped = 0;
  const insertAll = db.transaction((batch: InsertableTransaction[]) => {
    for (const r of batch) {
      const result = stmt.run(
        accountId,
        r.tradeDate,
        r.actionCanonical,
        r.actionRaw,
        r.symbol,
        r.description,
        r.quantity,
        r.price,
        r.fees,
        r.amount,
        JSON.stringify(r.raw),
        r.sourceFile,
        r.contentHash,
      );
      if (result.changes === 1) inserted++;
      else skipped++;
    }
  });
  insertAll(rows);
  return { inserted, skipped };
}

export function listTransactionsByAccount(
  db: Db,
  accountId: number,
): StoredTransaction[] {
  const rows = db
    .prepare("SELECT * FROM transactions WHERE account_id = ? ORDER BY trade_date, id")
    .all(accountId) as TxRow[];
  return rows.map(rowToStored);
}

export function countDistinctUnknownActions(
  db: Db,
): Array<{ actionRaw: string; count: number }> {
  const rows = db
    .prepare(`
      SELECT action_raw AS actionRaw, COUNT(*) AS count
      FROM transactions
      WHERE action_canonical = 'UNKNOWN'
      GROUP BY action_raw
      ORDER BY count DESC, action_raw
    `)
    .all() as Array<{ actionRaw: string; count: number }>;
  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/db/repos/transactions.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/db/repos/transactions.ts tests/db/repos/transactions.test.ts
git status
git commit -m "$(cat <<'EOF'
Add transactions repo (idempotent insert + list + UNKNOWN tally)

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Position snapshots repo

**Files:**
- Create: `lib/db/repos/positionSnapshots.ts`
- Test: `tests/db/repos/positionSnapshots.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/db/repos/positionSnapshots.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import {
  insertPositionSnapshots,
  listLatestSnapshot,
  listEarliestSnapshot,
  listSnapshotAsOfDates,
} from "@/lib/db/repos/positionSnapshots";

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

const ROW = {
  asOf: "2026-01-05",
  symbol: "FAKE",
  description: "FAKE INC",
  quantity: 10,
  price: 55,
  marketValue: 550,
  costBasis: 500,
  assetType: "equity" as const,
  raw: { Symbol: "FAKE" } as Record<string, unknown>,
  sourceFile: "Demo-Positions-2026-01-05-090000.csv",
  contentHash: "ps-1",
};

describe("position_snapshots repo", () => {
  it("inserts new snapshots; re-insert is a no-op", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    expect(insertPositionSnapshots(db, accountId, [ROW])).toEqual({ inserted: 1, skipped: 0 });
    expect(insertPositionSnapshots(db, accountId, [ROW])).toEqual({ inserted: 0, skipped: 1 });
  });

  it("listLatestSnapshot returns rows from the most recent as_of", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    insertPositionSnapshots(db, accountId, [
      { ...ROW, asOf: "2026-01-04", contentHash: "h-1" },
      { ...ROW, asOf: "2026-01-05", contentHash: "h-2" },
      { ...ROW, asOf: "2026-01-05", symbol: "OTHER", contentHash: "h-3" },
    ]);
    const latest = listLatestSnapshot(db, accountId);
    expect(latest.asOf).toBe("2026-01-05");
    expect(latest.rows.map((r) => r.symbol).sort()).toEqual(["FAKE", "OTHER"]);
  });

  it("listEarliestSnapshot returns rows from the earliest as_of", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    insertPositionSnapshots(db, accountId, [
      { ...ROW, asOf: "2026-01-04", contentHash: "h-1" },
      { ...ROW, asOf: "2026-01-05", contentHash: "h-2" },
    ]);
    expect(listEarliestSnapshot(db, accountId)?.asOf).toBe("2026-01-04");
  });

  it("listSnapshotAsOfDates returns distinct dates ordered ascending", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    insertPositionSnapshots(db, accountId, [
      { ...ROW, asOf: "2026-01-05", contentHash: "h-2" },
      { ...ROW, asOf: "2026-01-04", contentHash: "h-1" },
      { ...ROW, asOf: "2026-01-04", symbol: "OTHER", contentHash: "h-3" },
    ]);
    expect(listSnapshotAsOfDates(db, accountId)).toEqual(["2026-01-04", "2026-01-05"]);
  });

  it("listEarliestSnapshot returns null when no snapshots exist", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    expect(listEarliestSnapshot(db, accountId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/db/repos/positionSnapshots.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/db/repos/positionSnapshots.ts`**

```ts
import type { Db } from "@/lib/db/connect";
import type {
  CanonicalPositionSnapshot,
  AssetType,
} from "@/lib/brokerage/types";

export type StoredSnapshotRow = CanonicalPositionSnapshot & {
  id: number;
  accountId: number;
  sourceFile: string;
  contentHash: string;
};

export type InsertableSnapshotRow = CanonicalPositionSnapshot & {
  sourceFile: string;
  contentHash: string;
};

type DbRow = {
  id: number;
  account_id: number;
  as_of: string;
  symbol: string;
  description: string | null;
  quantity: number | null;
  price: number | null;
  market_value: number | null;
  cost_basis: number | null;
  asset_type: string | null;
  raw: string;
  source_file: string;
  content_hash: string;
};

function rowToStored(r: DbRow): StoredSnapshotRow {
  return {
    id: r.id,
    accountId: r.account_id,
    asOf: r.as_of,
    symbol: r.symbol,
    description: r.description,
    quantity: r.quantity,
    price: r.price,
    marketValue: r.market_value,
    costBasis: r.cost_basis,
    assetType: r.asset_type as AssetType | null,
    raw: JSON.parse(r.raw),
    sourceFile: r.source_file,
    contentHash: r.content_hash,
  };
}

export function insertPositionSnapshots(
  db: Db,
  accountId: number,
  rows: InsertableSnapshotRow[],
): { inserted: number; skipped: number } {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO position_snapshots (
      account_id, as_of, symbol, description, quantity, price,
      market_value, cost_basis, asset_type, raw, source_file, content_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  let skipped = 0;
  const tx = db.transaction((batch: InsertableSnapshotRow[]) => {
    for (const r of batch) {
      const result = stmt.run(
        accountId, r.asOf, r.symbol, r.description, r.quantity, r.price,
        r.marketValue, r.costBasis, r.assetType,
        JSON.stringify(r.raw), r.sourceFile, r.contentHash,
      );
      if (result.changes === 1) inserted++;
      else skipped++;
    }
  });
  tx(rows);
  return { inserted, skipped };
}

export type SnapshotForDate = {
  asOf: string;
  rows: StoredSnapshotRow[];
};

export function listLatestSnapshot(db: Db, accountId: number): SnapshotForDate {
  const dateRow = db
    .prepare("SELECT MAX(as_of) AS d FROM position_snapshots WHERE account_id = ?")
    .get(accountId) as { d: string | null };
  if (!dateRow.d) return { asOf: "", rows: [] };
  const rows = db
    .prepare("SELECT * FROM position_snapshots WHERE account_id = ? AND as_of = ? ORDER BY symbol")
    .all(accountId, dateRow.d) as DbRow[];
  return { asOf: dateRow.d, rows: rows.map(rowToStored) };
}

export function listEarliestSnapshot(db: Db, accountId: number): SnapshotForDate | null {
  const dateRow = db
    .prepare("SELECT MIN(as_of) AS d FROM position_snapshots WHERE account_id = ?")
    .get(accountId) as { d: string | null };
  if (!dateRow.d) return null;
  const rows = db
    .prepare("SELECT * FROM position_snapshots WHERE account_id = ? AND as_of = ? ORDER BY symbol")
    .all(accountId, dateRow.d) as DbRow[];
  return { asOf: dateRow.d, rows: rows.map(rowToStored) };
}

export function listSnapshotAsOfDates(db: Db, accountId: number): string[] {
  const rows = db
    .prepare("SELECT DISTINCT as_of AS d FROM position_snapshots WHERE account_id = ? ORDER BY as_of")
    .all(accountId) as Array<{ d: string }>;
  return rows.map((r) => r.d);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/db/repos/positionSnapshots.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/db/repos/positionSnapshots.ts tests/db/repos/positionSnapshots.test.ts
git status
git commit -m "$(cat <<'EOF'
Add position_snapshots repo (insert + latest/earliest + dates)

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Settings repo

**Files:**
- Create: `lib/db/repos/settings.ts`
- Test: `tests/db/repos/settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/db/repos/settings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import {
  getSetting,
  setSetting,
  getBoolSetting,
  setBoolSetting,
} from "@/lib/db/repos/settings";

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("settings repo", () => {
  it("getSetting returns null for missing key", () => {
    expect(getSetting(freshDb(), "missing")).toBeNull();
  });

  it("setSetting then getSetting roundtrips", () => {
    const db = freshDb();
    setSetting(db, "foo", "bar");
    expect(getSetting(db, "foo")).toBe("bar");
  });

  it("setSetting overwrites an existing key", () => {
    const db = freshDb();
    setSetting(db, "k", "1");
    setSetting(db, "k", "2");
    expect(getSetting(db, "k")).toBe("2");
  });

  it("boolean helpers parse 'true'/'false'", () => {
    const db = freshDb();
    setBoolSetting(db, "flag", true);
    expect(getBoolSetting(db, "flag")).toBe(true);
    setBoolSetting(db, "flag", false);
    expect(getBoolSetting(db, "flag")).toBe(false);
  });

  it("getBoolSetting returns the default for missing key", () => {
    const db = freshDb();
    expect(getBoolSetting(db, "missing", true)).toBe(true);
    expect(getBoolSetting(db, "missing", false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/db/repos/settings.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/db/repos/settings.ts`**

```ts
import type { Db } from "@/lib/db/connect";

export function getSetting(db: Db, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString());
}

export function getBoolSetting(db: Db, key: string, fallback = false): boolean {
  const v = getSetting(db, key);
  if (v === null) return fallback;
  return v === "true";
}

export function setBoolSetting(db: Db, key: string, value: boolean): void {
  setSetting(db, key, value ? "true" : "false");
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/db/repos/settings.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/db/repos/settings.ts tests/db/repos/settings.test.ts
git status
git commit -m "$(cat <<'EOF'
Add settings repo (key/value with boolean helpers)

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Content hash utility

**Files:**
- Create: `lib/ingest/contentHash.ts`
- Test: `tests/ingest/contentHash.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ingest/contentHash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  hashTransaction,
  hashSnapshot,
  canonicalJson,
} from "@/lib/ingest/contentHash";
import type {
  CanonicalTransaction,
  CanonicalPositionSnapshot,
} from "@/lib/brokerage/types";

const TX: CanonicalTransaction = {
  tradeDate: "2026-01-02",
  actionCanonical: "SELL_TO_OPEN",
  actionRaw: "Sell to Open",
  symbol: "FAKE 01/09/2026 10.00 P",
  description: "PUT FAKE",
  quantity: 1,
  price: 1,
  fees: 0.66,
  amount: 99.34,
  raw: { z: "last", a: "first" },
};

describe("canonicalJson", () => {
  it("sorts keys deterministically", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("is stable across nested key reordering", () => {
    expect(canonicalJson({ a: { y: 1, x: 2 } })).toBe('{"a":{"x":2,"y":1}}');
  });
});

describe("hashTransaction", () => {
  it("returns the same hash for the same row", () => {
    expect(hashTransaction("schwab", "999", TX)).toBe(hashTransaction("schwab", "999", TX));
  });

  it("differs when amount changes", () => {
    expect(hashTransaction("schwab", "999", TX))
      .not.toBe(hashTransaction("schwab", "999", { ...TX, amount: 100 }));
  });

  it("differs when account changes", () => {
    expect(hashTransaction("schwab", "999", TX))
      .not.toBe(hashTransaction("schwab", "888", TX));
  });

  it("is stable under raw key reordering", () => {
    expect(hashTransaction("schwab", "999", TX))
      .toBe(hashTransaction("schwab", "999", { ...TX, raw: { a: "first", z: "last" } }));
  });
});

describe("hashSnapshot", () => {
  const SNAP: CanonicalPositionSnapshot = {
    asOf: "2026-01-05",
    symbol: "FAKE",
    description: "FAKE INC",
    quantity: 10,
    price: 55,
    marketValue: 550,
    costBasis: 500,
    assetType: "equity",
    raw: { Symbol: "FAKE" },
  };

  it("is deterministic", () => {
    expect(hashSnapshot("schwab", "999", SNAP)).toBe(hashSnapshot("schwab", "999", SNAP));
  });

  it("varies with as_of and symbol", () => {
    expect(hashSnapshot("schwab", "999", SNAP))
      .not.toBe(hashSnapshot("schwab", "999", { ...SNAP, asOf: "2026-01-06" }));
    expect(hashSnapshot("schwab", "999", SNAP))
      .not.toBe(hashSnapshot("schwab", "999", { ...SNAP, symbol: "OTHER" }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/ingest/contentHash.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/ingest/contentHash.ts`**

```ts
import { createHash } from "node:crypto";
import type {
  CanonicalTransaction,
  CanonicalPositionSnapshot,
} from "@/lib/brokerage/types";

function replacer(_key: string, val: unknown): unknown {
  if (val !== null && typeof val === "object" && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
    return sorted;
  }
  return val;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, replacer);
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function hashTransaction(
  brokerageSlug: string,
  externalId: string,
  tx: CanonicalTransaction,
): string {
  return sha256Hex(canonicalJson({
    kind: "transaction",
    brokerage: brokerageSlug,
    account: externalId,
    tradeDate: tx.tradeDate,
    actionRaw: tx.actionRaw,
    symbol: tx.symbol,
    description: tx.description,
    quantity: tx.quantity,
    price: tx.price,
    fees: tx.fees,
    amount: tx.amount,
    raw: tx.raw,
  }));
}

export function hashSnapshot(
  brokerageSlug: string,
  externalId: string,
  snap: CanonicalPositionSnapshot,
): string {
  return sha256Hex(canonicalJson({
    kind: "snapshot",
    brokerage: brokerageSlug,
    account: externalId,
    asOf: snap.asOf,
    symbol: snap.symbol,
    quantity: snap.quantity,
    price: snap.price,
    marketValue: snap.marketValue,
    costBasis: snap.costBasis,
    assetType: snap.assetType,
    description: snap.description,
    raw: snap.raw,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/ingest/contentHash.test.ts
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/contentHash.ts tests/ingest/contentHash.test.ts
git status
git commit -m "$(cat <<'EOF'
Add deterministic content hash utility

SHA-256 of a key-sorted canonical JSON payload. Stable across re-exports
where row data is unchanged but key order or formatting drifts.

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Ingest pipeline

**Files:**
- Create: `tests/fixtures/schwab/Demo_XXX999_Transactions_20260105-090000.csv` (FICTIONAL)
- Create: `tests/fixtures/schwab/Demo-Positions-2026-01-05-090000.csv` (FICTIONAL)
- Create: `lib/ingest/run.ts`
- Test: `tests/ingest/run.test.ts`

- [ ] **Step 1: Create FICTIONAL test fixtures**

`FAKE` and `MADEUP` are not real tickers in the user's portfolio. Verify before staging.

Create `tests/fixtures/schwab/Demo_XXX999_Transactions_20260105-090000.csv`:

```csv
"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"01/02/2026","Journal","","MoneyLink Deposit","","","","$10,000.00"
"01/03/2026","Sell to Open","FAKE 01/09/2026 10.00 P","PUT FAKE EXP 01/09/26","1","$1.00","$0.66","$99.34"
"01/04/2026","Buy","MADEUP","MADEUP INC","10","$50.00","$0.00","-$500.00"
```

Create `tests/fixtures/schwab/Demo-Positions-2026-01-05-090000.csv`:

```csv
"Positions for account Demo ...999 as of 09:00 AM ET, 2026/01/05"

"Symbol","Description","Qty (Quantity)","Price","Mkt Val (Market Value)","Cost Basis","Asset Type"
"MADEUP","MADEUP INC","10","$55.00","$550.00","$500.00","Equity"
"FAKE 01/09/2026 10.00 P","PUT FAKE EXP 01/09/26","-1","$0.50","-$50.00","--","Option"
"Cash & Cash Investments","","","","$9,599.34","","Cash"
"Account Total","","","","$10,099.34","","--"
```

- [ ] **Step 2: Write the failing test**

Create `tests/ingest/run.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import { runIngest } from "@/lib/ingest/run";
import { listAccounts } from "@/lib/db/repos/accounts";
import { listTransactionsByAccount, countDistinctUnknownActions } from "@/lib/db/repos/transactions";
import { listLatestSnapshot } from "@/lib/db/repos/positionSnapshots";

function setupDataDir(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ingest-test-"));
  const txDir = path.join(root, "schwab", "999", "transactions");
  const posDir = path.join(root, "schwab", "999", "positions");
  mkdirSync(txDir, { recursive: true });
  mkdirSync(posDir, { recursive: true });
  const fixturesDir = path.join(process.cwd(), "tests", "fixtures", "schwab");
  copyFileSync(
    path.join(fixturesDir, "Demo_XXX999_Transactions_20260105-090000.csv"),
    path.join(txDir, "Demo_XXX999_Transactions_20260105-090000.csv"),
  );
  copyFileSync(
    path.join(fixturesDir, "Demo-Positions-2026-01-05-090000.csv"),
    path.join(posDir, "Demo-Positions-2026-01-05-090000.csv"),
  );
  return root;
}

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("runIngest", () => {
  it("ingests transactions and positions into a fresh DB", () => {
    const db = freshDb();
    const dataDir = setupDataDir();
    const summary = runIngest(db, dataDir);
    expect(summary.accountsTouched).toBe(1);
    expect(summary.transactionsInserted).toBe(3);
    expect(summary.snapshotsInserted).toBe(3);

    const accounts = listAccounts(db);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      brokerageSlug: "schwab",
      externalId: "999",
      label: "Demo",
    });
    expect(listTransactionsByAccount(db, accounts[0].id)).toHaveLength(3);
    const latest = listLatestSnapshot(db, accounts[0].id);
    expect(latest.asOf).toBe("2026-01-05");
  });

  it("auto-derives seed from earliest snapshot on first ingest", () => {
    const db = freshDb();
    runIngest(db, setupDataDir());
    const accounts = listAccounts(db);
    expect(accounts[0].seedDate).toBe("2026-01-05");
    expect(accounts[0].seedValue).toBeCloseTo(10099.34, 2);
  });

  it("does not overwrite an existing seed on re-ingest", () => {
    const db = freshDb();
    const dataDir = setupDataDir();
    runIngest(db, dataDir);
    const accounts = listAccounts(db);
    db.prepare("UPDATE accounts SET seed_date = ?, seed_value = ? WHERE id = ?")
      .run("2026-01-15", 12345, accounts[0].id);
    runIngest(db, dataDir);
    const after = listAccounts(db);
    expect(after[0].seedDate).toBe("2026-01-15");
    expect(after[0].seedValue).toBe(12345);
  });

  it("re-running ingest is a no-op (zero new inserts)", () => {
    const db = freshDb();
    const dataDir = setupDataDir();
    runIngest(db, dataDir);
    const summary = runIngest(db, dataDir);
    expect(summary.transactionsInserted).toBe(0);
    expect(summary.snapshotsInserted).toBe(0);
    expect(summary.transactionsSkipped).toBeGreaterThan(0);
  });

  it("reports unmapped action counts in the summary", () => {
    const db = freshDb();
    const summary = runIngest(db, setupDataDir());
    expect(summary.unmappedActions).toEqual(countDistinctUnknownActions(db));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run tests/ingest/run.test.ts
```

Expected: FAIL — `lib/ingest/run` does not exist.

- [ ] **Step 4: Implement `lib/ingest/run.ts`**

```ts
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import type { Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import { brokerages, findBrokerage } from "@/lib/brokerage/registry";
import {
  upsertAccount,
  updateAccountSeed,
} from "@/lib/db/repos/accounts";
import {
  insertTransactions,
  countDistinctUnknownActions,
} from "@/lib/db/repos/transactions";
import {
  insertPositionSnapshots,
  listEarliestSnapshot,
} from "@/lib/db/repos/positionSnapshots";
import {
  hashTransaction,
  hashSnapshot,
} from "@/lib/ingest/contentHash";

export type IngestSummary = {
  filesProcessed: number;
  filesSkipped: number;
  accountsTouched: number;
  transactionsInserted: number;
  transactionsSkipped: number;
  snapshotsInserted: number;
  snapshotsSkipped: number;
  unmappedActions: Array<{ actionRaw: string; count: number }>;
  errors: Array<{ file: string; message: string }>;
};

const SUPPORTED_KINDS = ["transactions", "positions"] as const;
type Kind = (typeof SUPPORTED_KINDS)[number];

type DiscoveredFile = {
  brokerageSlug: string;
  externalId: string;
  kind: Kind;
  filepath: string;
};

function discoverFiles(dataDir: string): DiscoveredFile[] {
  if (!existsSync(dataDir)) return [];
  const out: DiscoveredFile[] = [];
  for (const brokerage of brokerages) {
    const broDir = path.join(dataDir, brokerage.slug);
    if (!existsSync(broDir) || !statSync(broDir).isDirectory()) continue;
    for (const externalId of readdirSync(broDir)) {
      const acctDir = path.join(broDir, externalId);
      if (!statSync(acctDir).isDirectory()) continue;
      for (const kind of SUPPORTED_KINDS) {
        const kindDir = path.join(acctDir, kind);
        if (!existsSync(kindDir)) continue;
        for (const f of readdirSync(kindDir)) {
          if (!f.toLowerCase().endsWith(".csv")) continue;
          out.push({
            brokerageSlug: brokerage.slug,
            externalId,
            kind,
            filepath: path.join(kindDir, f),
          });
        }
      }
    }
  }
  return out;
}

export function runIngest(db: Db, dataDir: string): IngestSummary {
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));

  const files = discoverFiles(dataDir).sort((a, b) =>
    a.filepath < b.filepath ? -1 : 1,
  );

  const summary: IngestSummary = {
    filesProcessed: 0,
    filesSkipped: 0,
    accountsTouched: 0,
    transactionsInserted: 0,
    transactionsSkipped: 0,
    snapshotsInserted: 0,
    snapshotsSkipped: 0,
    unmappedActions: [],
    errors: [],
  };

  const touchedAccounts = new Set<number>();

  for (const f of files) {
    try {
      const adapter = findBrokerage(f.brokerageSlug);
      if (!adapter) {
        summary.filesSkipped++;
        summary.errors.push({ file: f.filepath, message: `Unknown brokerage: ${f.brokerageSlug}` });
        continue;
      }

      const content = readFileSync(f.filepath, "utf8");
      const identity = adapter.identify({ filepath: f.filepath, content });

      if (identity.externalId !== f.externalId) {
        summary.filesSkipped++;
        summary.errors.push({
          file: f.filepath,
          message: `Path says external_id=${f.externalId} but file content says ${identity.externalId}`,
        });
        continue;
      }

      const accountId = upsertAccount(db, {
        brokerageSlug: f.brokerageSlug,
        externalId: identity.externalId,
        label: identity.label,
      });
      touchedAccounts.add(accountId);

      if (f.kind === "transactions") {
        const rows = adapter.parseTransactions({ filepath: f.filepath, content });
        const insertable = rows.map((r) => ({
          ...r,
          sourceFile: path.basename(f.filepath),
          contentHash: hashTransaction(f.brokerageSlug, identity.externalId, r),
        }));
        const result = insertTransactions(db, accountId, insertable);
        summary.transactionsInserted += result.inserted;
        summary.transactionsSkipped += result.skipped;
      } else {
        const rows = adapter.parsePositions({ filepath: f.filepath, content });
        const insertable = rows.map((r) => ({
          ...r,
          sourceFile: path.basename(f.filepath),
          contentHash: hashSnapshot(f.brokerageSlug, identity.externalId, r),
        }));
        const result = insertPositionSnapshots(db, accountId, insertable);
        summary.snapshotsInserted += result.inserted;
        summary.snapshotsSkipped += result.skipped;
      }
      summary.filesProcessed++;
    } catch (err) {
      summary.filesSkipped++;
      summary.errors.push({
        file: f.filepath,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const accountId of touchedAccounts) {
    const account = db
      .prepare("SELECT seed_date, seed_value FROM accounts WHERE id = ?")
      .get(accountId) as { seed_date: string | null; seed_value: number | null } | undefined;
    if (!account) continue;
    if (account.seed_date !== null && account.seed_value !== null) continue;

    const earliest = listEarliestSnapshot(db, accountId);
    if (!earliest) continue;
    const seedValue = earliest.rows.reduce((sum, r) => sum + (r.marketValue ?? 0), 0);
    updateAccountSeed(db, accountId, earliest.asOf, seedValue);
  }

  summary.accountsTouched = touchedAccounts.size;
  summary.unmappedActions = countDistinctUnknownActions(db);
  return summary;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run tests/ingest/run.test.ts
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

Hygiene check first:

```bash
git status
git diff --cached -- 'tests/fixtures/schwab/*.csv' 2>/dev/null
```

Eyeball: confirm fixture CSVs contain only `FAKE` / `MADEUP` symbols and round dollar amounts that look invented (not your actual portfolio).

```bash
git add tests/fixtures/schwab/ lib/ingest/run.ts tests/ingest/run.test.ts
git commit -m "$(cat <<'EOF'
Add ingest pipeline + Schwab fixtures (fictional)

Walks data/<brokerage>/<external_id>/{transactions,positions}/, runs
adapters, idempotent inserts via content_hash, auto-derives seed for
new accounts. Test fixtures are fully fictional (FAKE/MADEUP).

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: `npm run ingest` script entry point

**Files:**
- Create: `scripts/ingest.ts`
- Modify: `package.json` (add `tsx` dep + ingest script)

- [ ] **Step 1: Add `tsx` dev dependency**

```bash
npm install --save-dev tsx@^4.19.0
```

- [ ] **Step 2: Create `scripts/ingest.ts`**

```ts
import path from "node:path";
import { openDb } from "@/lib/db/connect";
import { runIngest } from "@/lib/ingest/run";

function main(): void {
  const dataDir = path.join(process.cwd(), "data");
  const dbPath = path.join(dataDir, "portfolio.db");
  const db = openDb(dbPath);
  try {
    const summary = runIngest(db, dataDir);
    console.log("== ingest summary ==");
    console.log(`files processed: ${summary.filesProcessed}`);
    console.log(`files skipped:   ${summary.filesSkipped}`);
    console.log(`accounts touched: ${summary.accountsTouched}`);
    console.log(`transactions inserted: ${summary.transactionsInserted}, skipped: ${summary.transactionsSkipped}`);
    console.log(`snapshots inserted:    ${summary.snapshotsInserted}, skipped: ${summary.snapshotsSkipped}`);
    if (summary.unmappedActions.length > 0) {
      console.log("\nunmapped actions (consider extending the mapping table):");
      for (const u of summary.unmappedActions) console.log(`  ${u.actionRaw}: ${u.count}`);
    }
    if (summary.errors.length > 0) {
      console.log("\nerrors:");
      for (const e of summary.errors) console.log(`  [${e.file}] ${e.message}`);
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}

main();
```

- [ ] **Step 3: Wire up the npm script**

Modify `package.json` `scripts`. Add:

```json
"ingest": "tsx scripts/ingest.ts"
```

(Keep all existing scripts; just add this one.)

- [ ] **Step 4: Smoke test the script**

```bash
npm run ingest
```

Expected: prints summary lines and exits 0. With no CSVs in `data/<brokerage>/<acct>/` yet, the summary will show zeros — that's fine.

If `data/transactions/` and `data/positions/` from the pre-Phase-1 layout still exist, they're not in the new layout so they're not discovered. Migrating them is part of Task 23.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/ingest.ts
git status
git commit -m "$(cat <<'EOF'
Add npm run ingest script entry point

tsx-based runner that opens data/portfolio.db and runs ingest.

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: `npm run account:configure` admin command

Replaces `data/config.json`.

**Files:**
- Create: `lib/scripts/accountConfigure.ts` (the testable function)
- Test: `tests/scripts/account-configure.test.ts`
- Create: `scripts/account-configure.ts` (CLI wrapper)
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/account-configure.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount, getAccountByExternal } from "@/lib/db/repos/accounts";
import { getSetting, getBoolSetting } from "@/lib/db/repos/settings";
import { configureAccount } from "@/lib/scripts/accountConfigure";

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "Original" });
  return db;
}

describe("configureAccount", () => {
  it("sets seedDate, seedValue, label, benchmark", () => {
    const db = freshDb();
    configureAccount(db, {
      account: "schwab:999",
      seedDate: "2026-01-15",
      seedValue: 12345,
      label: "Renamed",
      benchmark: "SPY",
    });
    const got = getAccountByExternal(db, "schwab", "999");
    expect(got?.label).toBe("Renamed");
    expect(got?.seedDate).toBe("2026-01-15");
    expect(got?.seedValue).toBe(12345);
    expect(got?.benchmark).toBe("SPY");
  });

  it("--primary stamps the dashboard.primary_account setting", () => {
    const db = freshDb();
    configureAccount(db, { account: "schwab:999", primary: true });
    expect(getSetting(db, "dashboard.primary_account")).toBe("schwab:999");
  });

  it("marketDataEnabled stamps the market_data.enabled setting", () => {
    const db = freshDb();
    configureAccount(db, { account: "schwab:999", marketDataEnabled: true });
    expect(getBoolSetting(db, "market_data.enabled")).toBe(true);
    configureAccount(db, { account: "schwab:999", marketDataEnabled: false });
    expect(getBoolSetting(db, "market_data.enabled")).toBe(false);
  });

  it("throws when account does not exist", () => {
    const db = freshDb();
    expect(() => configureAccount(db, { account: "schwab:000", label: "X" }))
      .toThrow(/No account/);
  });

  it("throws on malformed --account", () => {
    const db = freshDb();
    expect(() => configureAccount(db, { account: "bad-format" })).toThrow(/--account/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/scripts/account-configure.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/scripts/accountConfigure.ts`**

```ts
import type { Db } from "@/lib/db/connect";
import {
  getAccountByExternal,
  updateAccountSeed,
  updateAccountLabel,
  updateAccountBenchmark,
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

  if (input.label !== undefined) updateAccountLabel(db, account.id, input.label);
  if (input.benchmark !== undefined) updateAccountBenchmark(db, account.id, input.benchmark);
  if (input.seedDate !== undefined || input.seedValue !== undefined) {
    const seedDate = input.seedDate ?? account.seedDate;
    const seedValue = input.seedValue ?? account.seedValue;
    updateAccountSeed(db, account.id, seedDate, seedValue);
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

Expected: 5 passed.

- [ ] **Step 5: Implement the CLI wrapper `scripts/account-configure.ts`**

```ts
import path from "node:path";
import { openDb } from "@/lib/db/connect";
import { configureAccount, type ConfigureInput } from "@/lib/scripts/accountConfigure";

function parseArgs(argv: string[]): ConfigureInput {
  const out: ConfigureInput = { account: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const key = eq >= 0 ? a.slice(0, eq) : a;
    const val = eq >= 0 ? a.slice(eq + 1) : argv[++i];
    switch (key) {
      case "--account":     out.account = val; break;
      case "--seed-date":   out.seedDate = val; break;
      case "--seed-value":  out.seedValue = Number(val); break;
      case "--label":       out.label = val; break;
      case "--benchmark":   out.benchmark = val; break;
      case "--primary":     out.primary = true; i--; break;
      case "--market-data": out.marketDataEnabled = val === "on" || val === "true"; break;
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

- [ ] **Step 6: Wire up the npm script**

In `package.json` `scripts`, add:

```json
"account:configure": "tsx scripts/account-configure.ts"
```

- [ ] **Step 7: Smoke test (no real ingest needed)**

```bash
npm run account:configure -- --account=schwab:999 --label=TestRun || echo "(expected to fail until ingest has populated the account)"
```

Expected: prints either `configured schwab:999` (if you have the account) or an error like `No account schwab:999 — has it been ingested?` — both verify the CLI plumbing works.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json lib/scripts/accountConfigure.ts \
        scripts/account-configure.ts tests/scripts/account-configure.test.ts
git status
git commit -m "$(cat <<'EOF'
Add npm run account:configure admin command

Replaces data/config.json. Sets per-account seed/label/benchmark and
global settings.dashboard.primary_account / market_data.enabled.

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Migrate dashboard to DB reads

This is the largest task. It must land as one cohesive change because the function signatures, call sites, and integration test all need to align for tests to pass.

**Files:**
- Create: `lib/util/optionSymbol.ts`
- Test: `tests/util/optionSymbol.test.ts`
- Modify: `lib/brokerage/schwab/positions.ts` (use the util instead of inline regex)
- Modify: `lib/positions/seed.ts`
- Create: `lib/server/dashboardSource.ts`
- Modify: `lib/server/dashboard.ts`
- Modify: `tests/positions/seed.test.ts`
- Modify: `tests/integration.test.ts`

- [ ] **Step 0a: Create option-symbol parser util**

Multiple modules need to parse Schwab-style option symbols (e.g., `"FAKE 01/09/2026 10.00 P"`): the snapshot parser, the dashboardSource transaction adapter (so option transactions get a populated `option` leg — many downstream metrics depend on it). Extract to a shared utility.

Create `tests/util/optionSymbol.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseOptionSymbol } from "@/lib/util/optionSymbol";

describe("parseOptionSymbol", () => {
  it("parses a put", () => {
    expect(parseOptionSymbol("FAKE 01/09/2026 10.00 P")).toEqual({
      underlying: "FAKE",
      expiry: "2026-01-09",
      strike: 10,
      callPut: "P",
    });
  });

  it("parses a call with multi-letter ticker and decimal in ticker", () => {
    expect(parseOptionSymbol("ABC.D 12/20/2026 100 C")).toEqual({
      underlying: "ABC.D",
      expiry: "2026-12-20",
      strike: 100,
      callPut: "C",
    });
  });

  it("returns null for non-option symbols", () => {
    expect(parseOptionSymbol("FAKE")).toBeNull();
    expect(parseOptionSymbol("not a symbol")).toBeNull();
    expect(parseOptionSymbol("")).toBeNull();
  });
});
```

Run the test (it will fail — module not found):

```bash
npx vitest run tests/util/optionSymbol.test.ts
```

Create `lib/util/optionSymbol.ts`:

```ts
export type OptionSymbol = {
  underlying: string;
  expiry: string;       // YYYY-MM-DD
  strike: number;
  callPut: "C" | "P";
};

const OPTION_SYMBOL_RE =
  /^([A-Z.]+)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+([0-9]+(?:\.[0-9]+)?)\s+([PC])$/;

export function parseOptionSymbol(symbol: string): OptionSymbol | null {
  const m = symbol.match(OPTION_SYMBOL_RE);
  if (!m) return null;
  const [, underlying, mm, dd, yyyy, strike, pc] = m;
  return {
    underlying,
    expiry: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
    strike: Number(strike),
    callPut: pc as "C" | "P",
  };
}
```

Run the test:

```bash
npx vitest run tests/util/optionSymbol.test.ts
```

Expected: 3 passed.

- [ ] **Step 0b: Refactor `lib/brokerage/schwab/positions.ts` to use the util**

Replace the inline `OPTION_SYMBOL` regex / parsing code in `lib/brokerage/schwab/positions.ts` with an import from `@/lib/util/optionSymbol`. (Note: positions.ts currently uses the regex only inline-checked via the option's `Asset Type === "Option"` branch — when classifying option rows, the symbol is just stored verbatim, not split. Search for any inline option-symbol parsing in this file. If there isn't any in the current implementation from Task 9 (because we kept option symbols intact in `CanonicalPositionSnapshot.symbol`), this step is a no-op for positions.ts and you skip directly to Step 0c.)

Run the schwab positions test to confirm nothing broke:

```bash
npx vitest run tests/brokerage/schwab/positions.test.ts
```

Expected: 6 passed.

- [ ] **Step 0c: Commit the util**

```bash
git add lib/util/optionSymbol.ts tests/util/optionSymbol.test.ts
git status
git commit -m "$(cat <<'EOF'
Add option-symbol parser util

Shared parsing of Schwab-style option symbols ('FAKE 01/09/2026 10.00 P')
into { underlying, expiry, strike, callPut }. Used by the brokerage
adapter's snapshot parsing and by dashboardSource's transaction adapter
to repopulate option-leg fields that legacy model code depends on.

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 1: Familiarize with the current code**

```bash
sed -n '1,40p' lib/model/types.ts
sed -n '1,80p' lib/model/portfolio.ts
sed -n '1,80p' lib/positions/seed.ts
sed -n '1,215p' lib/server/dashboard.ts
```

The current `chooseSeed` takes `config: Config`. The new signature takes `seedDate` and `seedValue` directly.

The current dashboard reads `config.json` via `readConfigFile`, then loads CSVs. The new dashboard reads from `data/portfolio.db` via repos, builds a temporary `Config` object from DB rows so the rest of the model code continues to work unchanged.

- [ ] **Step 2: Modify `lib/positions/seed.ts`**

Replace the whole file:

```ts
import type { OpenOption, Seed } from "@/lib/model/types";
import type { Transaction } from "@/lib/csv/types";
import type { PositionsSnapshot } from "@/lib/positions/types";

export function buildSeedFromSnapshot(snap: PositionsSnapshot): Seed {
  const date = snap.asOf.slice(0, 10);
  const initialShares = snap.shares
    .filter((s) => s.quantity > 0)
    .map((s) => ({ ticker: s.ticker, shares: s.quantity, costBasis: s.costBasis }));
  const initialOptions: OpenOption[] = snap.options
    .filter((o) => o.quantity < 0)
    .map((o) => {
      const qty = Math.abs(o.quantity);
      return {
        contract: {
          ticker: o.underlying,
          expiry: o.expiry,
          strike: o.strike,
          type: o.callPut === "C" ? "Call" : "Put",
        },
        quantityOpen: qty,
        netPremiumCollected: 0,
        entries: [{ date, price: o.price, qty }],
      };
    });
  return { asOf: date, cash: snap.cash, initialShares, initialOptions };
}

export function chooseSeed(opts: {
  transactions: Transaction[];
  earliestSnapshot: PositionsSnapshot | null;
  seedDate: string;
  seedValue: number;
}): Seed {
  const { transactions, earliestSnapshot, seedDate, seedValue } = opts;

  const fallbackSeed: Seed = {
    asOf: seedDate,
    cash: seedValue,
    initialShares: [],
    initialOptions: [],
  };

  if (earliestSnapshot === null) return fallbackSeed;

  const snapDate = earliestSnapshot.asOf.slice(0, 10);
  const earliestTxDate = transactions.map((t) => t.tradeDate).sort()[0];

  if (earliestTxDate === undefined || earliestTxDate >= snapDate) {
    return buildSeedFromSnapshot(earliestSnapshot);
  }
  return fallbackSeed;
}
```

- [ ] **Step 3: Update `tests/positions/seed.test.ts`**

```bash
grep -n "chooseSeed" tests/positions/seed.test.ts
```

For each call that looks like:

```ts
chooseSeed({
  transactions,
  earliestSnapshot,
  config: { seedDate: "2026-01-15", seedValue: 12345, marketData: { enabled: true } },
})
```

Rewrite as:

```ts
chooseSeed({
  transactions,
  earliestSnapshot,
  seedDate: "2026-01-15",
  seedValue: 12345,
})
```

Drop any unused `config:` field. The test assertions stay the same — `chooseSeed`'s output is identical for the same inputs.

- [ ] **Step 4: Run seed.test.ts to verify it passes**

```bash
npx vitest run tests/positions/seed.test.ts
```

Expected: original assertions pass with the new signature.

- [ ] **Step 5: Create `lib/server/dashboardSource.ts`**

This module assembles legacy-shaped views (`Transaction[]`, `PositionsSnapshot`) from the canonical DB rows so the existing model code keeps working unchanged.

```ts
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import {
  getAccountByExternal,
  type Account,
} from "@/lib/db/repos/accounts";
import {
  listTransactionsByAccount,
  type StoredTransaction,
} from "@/lib/db/repos/transactions";
import {
  listLatestSnapshot,
  listEarliestSnapshot,
  type SnapshotForDate,
} from "@/lib/db/repos/positionSnapshots";
import { getSetting, getBoolSetting } from "@/lib/db/repos/settings";
import { parseOptionSymbol } from "@/lib/util/optionSymbol";
import type { Transaction } from "@/lib/csv/types";
import type { PositionsSnapshot } from "@/lib/positions/types";
import type { CanonicalAction } from "@/lib/brokerage/types";

export type DashboardSource = {
  account: Account;
  transactions: Transaction[];
  earliestSnapshot: PositionsSnapshot | null;
  latestSnapshot: PositionsSnapshot | null;
  marketDataEnabled: boolean;
};

export type DashboardSourceMissing =
  | { kind: "no-primary-account" }
  | { kind: "primary-account-not-found"; account: string };

export function loadDashboardSource(
  db: Db,
): { kind: "ok"; source: DashboardSource } | DashboardSourceMissing {
  const primary = getSetting(db, "dashboard.primary_account");
  if (!primary) return { kind: "no-primary-account" };

  const m = primary.match(/^([a-z]+):([A-Za-z0-9]+)$/);
  if (!m) return { kind: "primary-account-not-found", account: primary };
  const [, brokerageSlug, externalId] = m;

  const account = getAccountByExternal(db, brokerageSlug, externalId);
  if (!account) return { kind: "primary-account-not-found", account: primary };

  return {
    kind: "ok",
    source: {
      account,
      transactions: listTransactionsByAccount(db, account.id).map(toLegacyTx),
      earliestSnapshot: snapshotForDateToLegacy(listEarliestSnapshot(db, account.id)),
      latestSnapshot: snapshotForDateToLegacy(listLatestSnapshot(db, account.id)),
      marketDataEnabled: getBoolSetting(db, "market_data.enabled", false),
    },
  };
}

export function openProductionDb(): Db {
  const dbPath = path.join(process.cwd(), "data", "portfolio.db");
  const db = openDb(dbPath);
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

const ACTION_MAP: Record<CanonicalAction, Transaction["action"]> = {
  BUY: "Buy",
  SELL: "Sell",
  BUY_TO_OPEN: "Unknown",
  SELL_TO_OPEN: "SellToOpen",
  BUY_TO_CLOSE: "BuyToClose",
  SELL_TO_CLOSE: "Unknown",
  ASSIGNMENT: "Assigned",
  EXERCISE: "Unknown",
  EXPIRATION: "Expired",
  DIVIDEND: "QualifiedDividend",
  INTEREST: "BankInterest",
  FEE: "ServiceFee",
  JOURNAL: "Journal",
  TRANSFER_IN: "Journal",
  TRANSFER_OUT: "WireSent",
  UNKNOWN: "Unknown",
};

function toLegacyTx(stored: StoredTransaction): Transaction {
  const raw = stored.raw as Record<string, string>;
  const symbol = stored.symbol ?? undefined;
  const optionLeg = symbol ? parseOptionSymbol(symbol) : null;
  return {
    tradeDate: stored.tradeDate,
    action: ACTION_MAP[stored.actionCanonical],
    rawAction: stored.actionRaw,
    ticker: optionLeg ? optionLeg.underlying : symbol,
    option: optionLeg
      ? {
          ticker: optionLeg.underlying,
          expiry: optionLeg.expiry,
          strike: optionLeg.strike,
          type: optionLeg.callPut === "C" ? "Call" : "Put",
        }
      : undefined,
    quantity: stored.quantity ?? 0,
    price: stored.price ?? undefined,
    fees: stored.fees ?? 0,
    amount: stored.amount,
    raw: {
      Date: raw.Date ?? "",
      Action: raw.Action ?? "",
      Symbol: raw.Symbol ?? "",
      Description: raw.Description ?? "",
      Quantity: raw.Quantity ?? "",
      Price: raw.Price ?? "",
      "Fees & Comm": raw["Fees & Comm"] ?? "",
      Amount: raw.Amount ?? "",
    },
  };
}

function snapshotForDateToLegacy(
  snap: SnapshotForDate | null,
): PositionsSnapshot | null {
  if (!snap || snap.rows.length === 0) return null;

  let cash = 0;
  let totalValue = 0;
  const shares: PositionsSnapshot["shares"] = [];
  const options: PositionsSnapshot["options"] = [];

  for (const r of snap.rows) {
    totalValue += r.marketValue ?? 0;
    if (r.assetType === "cash") {
      cash += r.marketValue ?? 0;
    } else if (r.assetType === "equity") {
      const qty = r.quantity ?? 0;
      const totalCost = r.costBasis ?? 0;
      shares.push({
        ticker: r.symbol,
        quantity: qty,
        price: r.price ?? 0,
        marketValue: r.marketValue ?? 0,
        costBasis: qty === 0 ? 0 : totalCost / qty,
      });
    } else if (r.assetType === "option") {
      const leg = parseOptionSymbol(r.symbol);
      if (!leg) continue;
      options.push({
        underlying: leg.underlying,
        expiry: leg.expiry,
        strike: leg.strike,
        callPut: leg.callPut,
        quantity: r.quantity ?? 0,
        price: r.price ?? 0,
        marketValue: r.marketValue ?? 0,
        delta: null,
        theta: null,
        intrinsicValue: null,
      });
    }
  }

  return { asOf: snap.asOf, cash, totalValue, shares, options, sourceFile: "(db)" };
}
```

- [ ] **Step 6: Replace `lib/server/dashboard.ts`**

Replace the entire file:

```ts
import { chooseSeed } from "@/lib/positions/seed";
import { buildPortfolio } from "@/lib/model/portfolio";
import { fetchQuotes, type Quote } from "@/lib/market/quotes";
import { loadHistoricalCloses } from "@/lib/market/historical";
import { computePortfolioValueSeries } from "@/lib/model/metrics/portfolio_value";
import { computeMarkToMarket, type MarkToMarket } from "@/lib/model/metrics/mark_to_market";
import type { Config, PortfolioState, Seed } from "@/lib/model/types";
import type { PositionsSnapshot } from "@/lib/positions/types";
import { yesterdayInET } from "@/lib/util/dates";
import { loadDashboardSource, openProductionDb } from "@/lib/server/dashboardSource";

export type DashboardData =
  | {
      kind: "ready";
      state: PortfolioState;
      sourceFiles: { transactions: string[]; positions: string[] };
      loadedAt: string;
      markToMarket: MarkToMarket | null;
      latestSnapshot: PositionsSnapshot | null;
    }
  | { kind: "no-csv"; dataDir: string }
  | { kind: "no-config"; dataDir: string }
  | { kind: "parse-error"; message: string };

export type LoadDashboardOptions = {
  includeMarketData?: boolean;
};

export async function loadDashboard(
  options: LoadDashboardOptions = {},
): Promise<DashboardData> {
  const includeMarketData = options.includeMarketData ?? true;
  const db = openProductionDb();

  try {
    const sourced = loadDashboardSource(db);
    if (sourced.kind === "no-primary-account" || sourced.kind === "primary-account-not-found") {
      return { kind: "no-config", dataDir: "(db)" };
    }
    const { account, transactions, earliestSnapshot, latestSnapshot, marketDataEnabled } = sourced.source;

    if (transactions.length === 0 && earliestSnapshot === null) {
      return { kind: "no-csv", dataDir: "(db)" };
    }

    if (account.seedDate === null || account.seedValue === null) {
      return { kind: "no-config", dataDir: "(db)" };
    }

    const config: Config = {
      seedDate: account.seedDate,
      seedValue: account.seedValue,
      marketData: { enabled: marketDataEnabled },
      benchmark: account.benchmark ?? undefined,
    };

    const seed = chooseSeed({
      transactions,
      earliestSnapshot,
      seedDate: account.seedDate,
      seedValue: account.seedValue,
    });

    const state = buildPortfolio(transactions, config, seed);

    if (includeMarketData && marketDataEnabled) {
      const heldTickers = collectHeldTickers(state, seed);
      if (heldTickers.length > 0) {
        const endDate = yesterdayInET();
        if (endDate >= seed.asOf) {
          const historicalCloses: Record<string, Record<string, number>> = {};
          const fetchFailures: Array<{ ticker: string; reason: string }> = [];

          for (const ticker of heldTickers) {
            const res = await loadHistoricalCloses(ticker, seed.asOf, endDate);
            if (res.kind === "ok") {
              const byDate: Record<string, number> = {};
              for (const { date, close } of res.closes) byDate[date] = close;
              historicalCloses[ticker] = byDate;
            } else {
              fetchFailures.push({ ticker, reason: res.message });
            }
          }

          const pv = computePortfolioValueSeries(state, seed, historicalCloses, endDate);
          state.portfolioValueSeries = pv.series;

          const missingSet = new Set<string>([
            ...fetchFailures.map((f) => f.ticker),
            ...pv.missingTickers,
          ]);
          const reasonByTicker = new Map(fetchFailures.map((f) => [f.ticker, f.reason]));
          for (const ticker of Array.from(missingSet).sort()) {
            state.warnings.push({
              kind: "MissingHistoricalPrices",
              ticker,
              reason:
                reasonByTicker.get(ticker) ??
                "No historical close data available for one or more dates.",
            });
          }

          if (typeof config.benchmark === "string" && config.benchmark.length > 0) {
            const ticker = config.benchmark;
            const res = await loadHistoricalCloses(ticker, seed.asOf, endDate);
            if (res.kind === "ok" && res.closes.length >= 2) {
              const baseline = res.closes[0].close;
              if (baseline > 0 && Number.isFinite(baseline)) {
                state.benchmarkSeries = res.closes.map(({ date, close }) => ({
                  date,
                  nav: state.config.seedValue * (close / baseline),
                }));
                state.benchmarkTicker = ticker;
              } else {
                state.warnings.push({
                  kind: "MissingHistoricalPrices",
                  ticker,
                  reason: "Baseline close is zero or invalid.",
                });
              }
            } else {
              const reason =
                res.kind === "error"
                  ? res.message
                  : "Insufficient historical data to render a benchmark line.";
              state.warnings.push({ kind: "MissingHistoricalPrices", ticker, reason });
            }
          }
        }
      }
    }

    let markToMarket: MarkToMarket | null = null;
    if (
      includeMarketData &&
      marketDataEnabled &&
      (state.openSharePositions.length > 0 || latestSnapshot !== null)
    ) {
      const snapSymbols = new Set((latestSnapshot?.shares ?? []).map((s) => s.ticker));
      const missing = state.openSharePositions
        .map((s) => s.ticker)
        .filter((t) => !snapSymbols.has(t));

      const quoteMap: Record<string, Quote | null> = {};
      if (missing.length > 0) {
        const results = await fetchQuotes(missing);
        for (const r of results) {
          if (r.kind === "ok") quoteMap[r.quote.ticker] = r.quote;
        }
        for (const t of missing) if (!(t in quoteMap)) quoteMap[t] = null;
      }
      markToMarket = computeMarkToMarket(state, quoteMap, latestSnapshot ?? undefined);
    }

    return {
      kind: "ready",
      state,
      sourceFiles: {
        transactions: [],
        positions: latestSnapshot ? [latestSnapshot.sourceFile] : [],
      },
      loadedAt: new Date().toISOString(),
      markToMarket,
      latestSnapshot: includeMarketData ? latestSnapshot : null,
    };
  } catch (err) {
    return { kind: "parse-error", message: err instanceof Error ? err.message : String(err) };
  } finally {
    db.close();
  }
}

function collectHeldTickers(state: PortfolioState, seed: Seed): string[] {
  const tickers = new Set<string>();
  for (const s of seed.initialShares) tickers.add(s.ticker);
  for (const t of state.transactions) {
    if ((t.action === "Buy" || t.action === "Sell") && t.ticker) {
      tickers.add(t.ticker);
    }
  }
  return Array.from(tickers).sort();
}
```

- [ ] **Step 7: Rewrite `tests/integration.test.ts`**

```bash
cat tests/integration.test.ts
```

Replace the file:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let originalCwd: string;
let tempRoot: string;

const TX_CSV = `"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"
"01/02/2026","Journal","","MoneyLink Deposit","","","","$10,000.00"
"01/03/2026","Sell to Open","FAKE 01/09/2026 10.00 P","PUT FAKE EXP 01/09/26","1","$1.00","$0.66","$99.34"
"01/04/2026","Buy","MADEUP","MADEUP INC","10","$50.00","$0.00","-$500.00"
`;

const POS_CSV = `"Positions for account Demo ...999 as of 09:00 AM ET, 2026/01/05"

"Symbol","Description","Qty (Quantity)","Price","Mkt Val (Market Value)","Cost Basis","Asset Type"
"MADEUP","MADEUP INC","10","$55.00","$550.00","$500.00","Equity"
"FAKE 01/09/2026 10.00 P","PUT FAKE EXP 01/09/26","-1","$0.50","-$50.00","--","Option"
"Cash & Cash Investments","","","","$9,599.34","","Cash"
"Account Total","","","","$10,099.34","","--"
`;

beforeEach(() => {
  originalCwd = process.cwd();
  tempRoot = mkdtempSync(path.join(tmpdir(), "schwab-lens-int-"));
  const dataDir = path.join(tempRoot, "data");
  const txDir = path.join(dataDir, "schwab", "999", "transactions");
  const posDir = path.join(dataDir, "schwab", "999", "positions");
  mkdirSync(txDir, { recursive: true });
  mkdirSync(posDir, { recursive: true });
  writeFileSync(
    path.join(txDir, "Demo_XXX999_Transactions_20260105-090000.csv"),
    TX_CSV,
  );
  writeFileSync(
    path.join(posDir, "Demo-Positions-2026-01-05-090000.csv"),
    POS_CSV,
  );
  process.chdir(tempRoot);
});

afterEach(() => {
  process.chdir(originalCwd);
});

describe("dashboard integration (DB-backed)", () => {
  it("renders a ready dashboard after ingest + configure", async () => {
    const { openDb } = await import("@/lib/db/connect");
    const { runIngest } = await import("@/lib/ingest/run");
    const { configureAccount } = await import("@/lib/scripts/accountConfigure");
    const { loadDashboard } = await import("@/lib/server/dashboard");

    const dbPath = path.join(tempRoot, "data", "portfolio.db");
    const db = openDb(dbPath);
    try {
      runIngest(db, path.join(tempRoot, "data"));
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

    const result = await loadDashboard({ includeMarketData: false });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.state.config.seedDate).toBe("2026-01-02");
    expect(result.state.config.seedValue).toBe(10000);
    expect(result.state.cashLedger.length).toBeGreaterThan(0);
  });

  it("returns no-config when primary account is unset", async () => {
    const { openDb } = await import("@/lib/db/connect");
    const { runIngest } = await import("@/lib/ingest/run");
    const { loadDashboard } = await import("@/lib/server/dashboard");

    const dbPath = path.join(tempRoot, "data", "portfolio.db");
    const db = openDb(dbPath);
    try {
      runIngest(db, path.join(tempRoot, "data"));
    } finally {
      db.close();
    }

    const result = await loadDashboard({ includeMarketData: false });
    expect(result.kind).toBe("no-config");
  });
});
```

- [ ] **Step 8: Run the integration test**

```bash
npx vitest run tests/integration.test.ts
```

Expected: 2 passed.

- [ ] **Step 9: Run the full test suite**

```bash
npm run test
```

Expected: every test file passes.

- [ ] **Step 10: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
git add lib/positions/seed.ts lib/server/dashboard.ts lib/server/dashboardSource.ts \
        tests/positions/seed.test.ts tests/integration.test.ts
git status
git commit -m "$(cat <<'EOF'
Migrate dashboard to read from SQLite DB

- chooseSeed takes seedDate/seedValue directly instead of a Config
- new lib/server/dashboardSource.ts assembles legacy-shaped tx +
  snapshot views from the canonical DB rows (no model code changes)
- loadDashboard reads from data/portfolio.db; primary account driven
  by settings.dashboard_primary_account
- integration test rewritten to set up a temp data dir + ingest +
  configure end-to-end

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Update `OnboardingCard` copy

**Files:**
- Modify: `app/components/OnboardingCard.tsx`

- [ ] **Step 1: Read the existing component**

```bash
cat app/components/OnboardingCard.tsx
```

- [ ] **Step 2: Update the copy**

Replace the body that mentions `config.json` with:

```tsx
<p>No primary account is configured. To get started:</p>
<ol className="list-decimal list-inside ml-4 mt-2 space-y-1">
  <li>Run <code>/ingest</code> to import your CSVs from <code>~/Downloads</code> into the DB.</li>
  <li>Run <code>npm run account:configure -- --account=&lt;brokerage&gt;:&lt;id&gt; --primary --seed-date=YYYY-MM-DD --seed-value=&lt;amount&gt;</code> to set the primary account.</li>
  <li>Reload this page.</li>
</ol>
```

Keep the surrounding container and styling. Remove any imports of removed types (e.g., `Config`).

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/OnboardingCard.tsx
git status
git commit -m "$(cat <<'EOF'
Update OnboardingCard copy for the new ingest + configure flow

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 21: Replace `/ingest` skill with generalized `/ingest`

**Files:**
- Create: `.claude/skills/ingest/SKILL.md`
- Create: `scripts/route-downloads.ts`
- Delete: `.claude/skills/ingest/SKILL.md`

- [ ] **Step 1: Read the existing skill for reference**

```bash
cat .claude/skills/ingest/SKILL.md
```

- [ ] **Step 2: Create `scripts/route-downloads.ts`**

```ts
import { readdirSync, statSync, mkdirSync, renameSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { routeFile } from "@/lib/brokerage/registry";

const downloadsDir = path.join(os.homedir(), "Downloads");
const dataDir = path.join(process.cwd(), "data");

function moveNoClobber(src: string, dest: string): "moved" | "skipped" {
  if (existsSync(dest)) return "skipped";
  mkdirSync(path.dirname(dest), { recursive: true });
  renameSync(src, dest);
  return "moved";
}

function main(): void {
  if (!existsSync(downloadsDir)) {
    console.log(`No ~/Downloads directory at ${downloadsDir}`);
    return;
  }

  const moved: string[] = [];
  const skipped: string[] = [];
  const unmatched: string[] = [];

  for (const name of readdirSync(downloadsDir)) {
    const src = path.join(downloadsDir, name);
    if (!statSync(src).isFile()) continue;
    if (!name.toLowerCase().endsWith(".csv")) continue;

    const route = routeFile(name);
    if (!route) {
      unmatched.push(name);
      continue;
    }

    const content = readFileSync(src, "utf8");
    const identity = route.brokerage.identify({ filepath: src, content });
    const dest = path.join(
      dataDir,
      route.brokerage.slug,
      identity.externalId,
      route.kind,
      name,
    );
    const result = moveNoClobber(src, dest);
    if (result === "moved") moved.push(`${name} -> ${path.relative(process.cwd(), dest)}`);
    else skipped.push(name);
  }

  console.log(`moved (${moved.length}):`);
  for (const m of moved) console.log(`  ${m}`);
  console.log(`skipped — destination already exists (${skipped.length}):`);
  for (const s of skipped) console.log(`  ${s}`);
  console.log(`unmatched — no brokerage adapter recognized (${unmatched.length}):`);
  for (const u of unmatched) console.log(`  ${u}`);
}

main();
```

- [ ] **Step 3: Create the new skill**

Create `.claude/skills/ingest/SKILL.md`:

````markdown
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
````

- [ ] **Step 4: Smoke test the routing script**

```bash
npx tsx scripts/route-downloads.ts
```

Expected: prints three sections, each with counts (zeros are fine if Downloads has no matching files).

- [ ] **Step 5: Delete the old skill**

```bash
git rm -r .claude/skills/ingest/
```

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/ingest/SKILL.md scripts/route-downloads.ts
git status
git commit -m "$(cat <<'EOF'
Replace /ingest skill with generalized /ingest

Uses the brokerage registry to route any matching CSVs (currently Schwab;
Robinhood/Chase/Fidelity adapters land in #18-#20), then runs the DB
upsert.

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: Delete dead code

**Files (deleted):**
- `lib/config.ts`
- `lib/csv/load.ts`
- `lib/csv/parse.ts`
- `lib/positions/load.ts`
- `lib/positions/parse.ts`
- `tests/config.test.ts`

`lib/csv/types.ts` and `lib/positions/types.ts` are kept — they're the boundary types between canonical (DB) and legacy (model) shapes. `lib/server/dashboardSource.ts` translates between the two.

- [ ] **Step 1: Verify no consumers remain**

```bash
grep -rn 'from "@/lib/config"' app/ lib/ tests/ scripts/ || echo "no consumers of lib/config"
grep -rn 'from "@/lib/csv/load"' app/ lib/ tests/ scripts/ || echo "no consumers of lib/csv/load"
grep -rn 'from "@/lib/csv/parse"' app/ lib/ tests/ scripts/ || echo "no consumers of lib/csv/parse"
grep -rn 'from "@/lib/positions/load"' app/ lib/ tests/ scripts/ || echo "no consumers of lib/positions/load"
grep -rn 'from "@/lib/positions/parse"' app/ lib/ tests/ scripts/ || echo "no consumers of lib/positions/parse"
```

Expected: each grep prints "no consumers of …".

If anything remains, fix the consumer first. Common fixes:
- A stray test still importing the old parser → move into `tests/brokerage/schwab/` or delete if duplicated.
- A leftover dashboard helper → it should already be replaced by `lib/server/dashboardSource.ts` from Task 19.

- [ ] **Step 2: Delete the dead files**

```bash
git rm lib/config.ts lib/csv/load.ts lib/csv/parse.ts \
       lib/positions/load.ts lib/positions/parse.ts \
       tests/config.test.ts
```

- [ ] **Step 3: Run the full test suite + typecheck**

```bash
npm run test
npm run typecheck
```

Expected: all tests pass; 0 type errors.

- [ ] **Step 4: Commit**

```bash
git status
git commit -m "$(cat <<'EOF'
Delete dead code superseded by Phase 1 DB layer

- lib/config.ts (replaced by accounts table + settings table)
- lib/csv/{load,parse}.ts (parsing relocated to lib/brokerage/schwab/)
- lib/positions/{load,parse}.ts (parsing relocated to lib/brokerage/schwab/)
- tests/config.test.ts

lib/csv/types.ts and lib/positions/types.ts are kept for now as the
boundary types between canonical (DB) and legacy (model) shapes.

Refs #15.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

## Task 23: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Expected: every test file passes.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 4: Manual end-to-end smoke test against real CSVs**

If real Schwab CSVs are still in `data/transactions/` and `data/positions/` from the pre-Phase-1 layout, relocate them once into the new layout (the skill won't help here — they're already inside `data/`):

```bash
mkdir -p data/schwab/520/transactions data/schwab/520/positions
mv data/transactions/Demo_XXX###_Transactions_*.csv data/schwab/520/transactions/ 2>/dev/null || true
mv data/positions/Demo-Positions-*.csv data/schwab/520/positions/ 2>/dev/null || true
rmdir data/transactions data/positions 2>/dev/null || true
```

Then ingest:

```bash
npm run ingest
```

Expected: summary shows one account touched (`schwab:520`), N transactions inserted, M snapshots inserted, 0 errors.

Configure (use the user's chosen seed values — do NOT bake them into committed code or this plan):

```bash
npm run account:configure -- \
  --account=schwab:520 \
  --primary \
  --seed-date=YYYY-MM-DD \
  --seed-value=NNNN \
  --benchmark=SPY \
  --market-data on
```

Expected output: `configured schwab:520`.

- [ ] **Step 5: Run the dev server and verify the dashboard renders**

```bash
npm run dev
```

Visit `http://localhost:3000`. Expected: dashboard renders with the same cards / NAV chart / transactions table as before. No new visual differences.

If onboarding card appears: `dashboard.primary_account` setting may not be set. Inspect:

```bash
sqlite3 data/portfolio.db "SELECT * FROM settings"
```

Re-run `npm run account:configure` with `--primary` if missing.

- [ ] **Step 6: Financial-hygiene check before opening PR**

```bash
git status
git diff main...HEAD --stat
git diff main...HEAD -- '**/*.csv' '**/*.xlsx'
```

Expected:
- Nothing under `data/`, `transactions/`, or `sheets/` is staged or modified
- The CSV diff only shows `tests/fixtures/schwab/*.csv` (fictional fixtures)
- No XLSX files

- [ ] **Step 7: Open the PR for #15**

```bash
git push -u origin fix/15-phase1-design-spec
gh pr create --title "Phase 1: SQLite foundation + multi-brokerage ingest" --body "$(cat <<'EOF'
## Summary

- Migrates the dashboard from stateless CSV parsing to a SQLite-backed data layer.
- Introduces a generic multi-brokerage / multi-account schema (`data/<brokerage>/<account>/`).
- Adds a Schwab adapter under `lib/brokerage/schwab/`; non-Schwab adapters tracked in #18 / #19 / #20.
- Adds `npm run ingest` (idempotent) and `npm run account:configure` (replaces `data/config.json`).
- No UI behavior change — the existing Demo dashboard renders identically, sourced from the DB.

## Test plan

- [ ] `npm run test` passes
- [ ] `npm run typecheck` is clean
- [ ] `npm run lint` is clean
- [ ] Manual: re-ingest + configure produce the expected DB state
- [ ] Manual: `npm run dev` and the dashboard renders Demo normally

Closes #15.

*Co-authored by Claude*
EOF
)"
```

Use **merge commit** (not squash) at merge time, per `CLAUDE.md`.

---

## Self-review

**Spec coverage:**
- Architecture / folder layout: Tasks 5–10, 16, 21
- Schema: Tasks 1–3
- Adapter interface and Schwab specifics: Tasks 4–10
- Ingest flow: Tasks 16, 17, 21
- Seed semantics (3 ways): Task 16 (auto-derive); Task 18 (user override via account:configure); Task 19 (read into dashboard)
- Admin command (`account:configure`): Task 18
- Dashboard integration: Tasks 19, 20
- SQLite library + migration runner: Tasks 1, 2
- Testing strategy: per-task TDD + integration test in Task 19 + final suite in Task 23

**Type consistency:** `Brokerage` interface used uniformly across registry / Schwab assembly / ingest. `CanonicalAction` enum referenced consistently in types.ts, actions.ts, contentHash.ts, dashboardSource.ts. `StoredTransaction` / `StoredSnapshotRow` confined to repos and dashboardSource.

**No placeholders.** Test fixtures clearly marked FICTIONAL (FAKE / MADEUP only).

**Scope note:** `lib/csv/types.ts` and `lib/positions/types.ts` survive Phase 1 as a deliberate boundary between canonical and legacy types. Acceptable for Phase 1's "no UI behavior change" discipline; revisit in Phase 2 or as a separate cleanup PR.
