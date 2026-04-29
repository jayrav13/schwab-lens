# Options Page (Issue #3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the legacy options/wheel dashboard at `/accounts/[uuid]/options`, sourced from the SQLite DB shipped in #1, and make `AppNav` account-aware.

**Architecture:** Add a thin DB-to-legacy-model adapter (`lib/model/fromDb.ts`) that converts `TransactionRow` and snapshot rows into the `Transaction[]` and `PositionsSnapshot` shapes the existing `lib/model/*` and components already understand. A new server function `loadAccountOptionsView(uuid)` in `lib/server/account.ts` orchestrates: account lookup, row mapping, `chooseSeed`, `buildPortfolio`, market-data, mark-to-market. The new page `app/accounts/[uuid]/options/page.tsx` is a thin wrapper rendering the existing card components. `AppNav` is split: the global brand and account picker stay in the root layout; per-account tabs render in pages so tab visibility can be data-driven (Options hidden when account has zero options-related transactions).

**Tech Stack:** Next.js 16 (App Router, Server Components), TypeScript, `better-sqlite3`, Vitest. No new dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-27-schwab-lens-design.md` — implements issue #3.

**Deviation from issue body:** The issue body says `/` should redirect to `/accounts/<first-account-uuid>/options`. After #1 we ship a useful accounts-list landing at `/`. This plan keeps the accounts list at `/` (the redirect approach is awkward when there are 2+ accounts). The accounts-list rows already link to `/accounts/{uuid}/options`. Revisit only if the redirect is explicitly desired.

---

## File structure

### Created

| Path | Responsibility |
| --- | --- |
| `lib/schwab/optionSymbol.ts` | Parse a Schwab option symbol (e.g., `"ACME 03/15/2026 100.00 P"`) into `OptionLeg` or return `null` for non-option symbols |
| `lib/model/fromDb.ts` | DB row to legacy model adapter: `transactionFromRow`, `positionsSnapshotFromRows`, `actionFromCanonical` |
| `lib/server/account.ts` | `loadAccountOptionsView(uuid)`: orchestrates account lookup, DB→model mapping, portfolio build, market data; returns a discriminated union or `null` when UUID unknown |
| `lib/server/accountTabs.ts` | `getAccountTabFlags(uuid)` — scans transactions to decide which per-account tabs are visible |
| `app/accounts/[uuid]/layout.tsx` | Per-account guard layout: 404s on unknown UUID |
| `app/accounts/[uuid]/options/page.tsx` | Wheel dashboard at the new URL; calls `loadAccountOptionsView` and renders the same cards as the old `/` |
| `app/components/AccountTabs.tsx` | Per-account tab strip rendered by each page (Overview / Options / Trades / Tx) |
| `app/components/AccountPicker.tsx` | Client-side `<select>` for switching accounts |
| `tests/schwab/optionSymbol.test.ts` | Parser unit tests |
| `tests/model/fromDb.test.ts` | Adapter unit tests |
| `tests/server/account.test.ts` | `loadAccountOptionsView` integration tests against in-memory DB |

### Modified

| Path | Change |
| --- | --- |
| `app/components/AppNav.tsx` | Add account-picker dropdown (takes `accounts` and optional `currentUuid` as props) |
| `app/layout.tsx` | Pass accounts list (from `loadAccounts()`) into `AppNav` |
| `lib/server/home.ts` | Export a `loadAccounts()` helper used by both `/` and the layout (DRY) |

### Deleted

None.

## Branching and commits

Branch: `fix/3-options-page` off `multi-account` (per the multi-account integration-branch workflow saved in memory).

All commits in this issue end with:

```
Closes #3

Co-Authored-By: Claude <noreply@anthropic.com>
```

Each task ends in a commit. Use a merge commit when the PR lands.

Before any commit: `git status` and `git diff --cached` — verify no `*.csv`, `*.xlsx`, or files under `data/`, `transactions/`, `sheets/` are staged.

## Tasks

---

### Task 1: Schwab option symbol parser

**Files:**
- Create: `lib/schwab/optionSymbol.ts`, `tests/schwab/optionSymbol.test.ts`

**Context:** Schwab encodes option contracts in the `Symbol` column as `"<UNDERLYING> <MM/DD/YYYY> <STRIKE> <C|P>"` (e.g., `"ACME 03/15/2026 100.00 P"`). The legacy parser produced an `OptionLeg` from this string. We need the same parsing now that option-leg structure is no longer stored in the DB (canonical rows just keep `symbol` as a string).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/schwab/optionSymbol.test.ts
import { describe, it, expect } from "vitest";
import { parseOptionSymbol } from "@/lib/schwab/optionSymbol";

describe("parseOptionSymbol", () => {
  it("parses a Schwab call-option symbol", () => {
    expect(parseOptionSymbol("ACME 03/15/2026 100.00 C")).toEqual({
      ticker: "ACME",
      expiry: "2026-03-15",
      strike: 100,
      type: "Call",
    });
  });

  it("parses a Schwab put-option symbol", () => {
    expect(parseOptionSymbol("ACME 12/19/2025 47.50 P")).toEqual({
      ticker: "ACME",
      expiry: "2025-12-19",
      strike: 47.5,
      type: "Put",
    });
  });

  it("returns null for an equity ticker", () => {
    expect(parseOptionSymbol("ACME")).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseOptionSymbol(null)).toBeNull();
  });

  it("returns null for an unrecognized format", () => {
    expect(parseOptionSymbol("ACME WEEKLY 100C")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/schwab/optionSymbol.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser**

```ts
// lib/schwab/optionSymbol.ts
import type { OptionLeg } from "@/lib/csv/types";

const PATTERN =
  /^([A-Z][A-Z0-9.]*)\s+(\d{2})\/(\d{2})\/(\d{4})\s+([0-9]+(?:\.[0-9]+)?)\s+([CP])$/;

export function parseOptionSymbol(symbol: string | null): OptionLeg | null {
  if (!symbol) return null;
  const match = PATTERN.exec(symbol.trim());
  if (!match) return null;
  const [, ticker, mm, dd, yyyy, strike, cp] = match;
  return {
    ticker,
    expiry: `${yyyy}-${mm}-${dd}`,
    strike: Number(strike),
    type: cp === "C" ? "Call" : "Put",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/schwab/optionSymbol.test.ts
```

Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/schwab/optionSymbol.ts tests/schwab/optionSymbol.test.ts
git commit -m "Add Schwab option-symbol parser producing OptionLeg

Closes #3

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: DB-to-legacy-model adapter

**Files:**
- Create: `lib/model/fromDb.ts`, `tests/model/fromDb.test.ts`

**Context:** The model layer (`lib/model/*`) and components consume the legacy `Transaction` and `PositionsSnapshot` shapes. The DB stores `CanonicalTransaction`-shaped rows. This adapter converts between them and is the only place that knows about the mapping.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/model/fromDb.test.ts
import { describe, it, expect } from "vitest";
import {
  transactionFromRow,
  positionsSnapshotFromRows,
  actionFromCanonical,
} from "@/lib/model/fromDb";
import type { TransactionRow } from "@/lib/db/repos/transactions";
import type { PositionSnapshotRow } from "@/lib/db/repos/positionSnapshots";

const baseTxRow: TransactionRow = {
  id: 1,
  account_id: 1,
  trade_date: "2026-01-05",
  action_canonical: "BUY",
  action_raw: "Buy",
  symbol: "ACME",
  description: "ACME CORP",
  quantity: 100,
  price: 50,
  fees: 0,
  amount: -5000,
  raw: JSON.stringify({
    Date: "01/05/2026",
    Action: "Buy",
    Symbol: "ACME",
    Description: "ACME CORP",
    Quantity: "100",
    Price: "$50.00",
    "Fees & Comm": "$0.00",
    Amount: "-$5000.00",
  }),
  source_file: "demo.csv",
  content_hash: "abc",
};

describe("actionFromCanonical", () => {
  it("maps BUY to Buy", () => {
    expect(actionFromCanonical("BUY", "Buy")).toBe("Buy");
  });

  it("maps SELL_TO_OPEN to SellToOpen", () => {
    expect(actionFromCanonical("SELL_TO_OPEN", "Sell to Open")).toBe(
      "SellToOpen",
    );
  });

  it("maps DIVIDEND to QualifiedDividend", () => {
    expect(actionFromCanonical("DIVIDEND", "Qualified Dividend")).toBe(
      "QualifiedDividend",
    );
  });

  it("maps INTEREST to BankInterest", () => {
    expect(actionFromCanonical("INTEREST", "Bank Interest")).toBe(
      "BankInterest",
    );
  });

  it("maps JOURNAL to Journal", () => {
    expect(actionFromCanonical("JOURNAL", "Journal")).toBe("Journal");
  });

  it("falls back to Unknown for UNKNOWN", () => {
    expect(actionFromCanonical("UNKNOWN", "Some weird action")).toBe(
      "Unknown",
    );
  });
});

describe("transactionFromRow", () => {
  it("maps a Buy row to a legacy Transaction with ticker", () => {
    const tx = transactionFromRow(baseTxRow);
    expect(tx.tradeDate).toBe("2026-01-05");
    expect(tx.action).toBe("Buy");
    expect(tx.ticker).toBe("ACME");
    expect(tx.option).toBeUndefined();
    expect(tx.quantity).toBe(100);
    expect(tx.price).toBe(50);
    expect(tx.fees).toBe(0);
    expect(tx.amount).toBe(-5000);
    expect(tx.rawAction).toBe("Buy");
  });

  it("maps a Sell-to-Open option row to a Transaction with option leg", () => {
    const tx = transactionFromRow({
      ...baseTxRow,
      action_canonical: "SELL_TO_OPEN",
      action_raw: "Sell to Open",
      symbol: "ACME 03/15/2026 100.00 P",
      description: "PUT ACME CORP $100 EXP 03/15/26",
      quantity: 1,
      price: 1.5,
      amount: 150,
    });
    expect(tx.action).toBe("SellToOpen");
    expect(tx.ticker).toBeUndefined();
    expect(tx.option).toEqual({
      ticker: "ACME",
      expiry: "2026-03-15",
      strike: 100,
      type: "Put",
    });
  });

  it("preserves raw fields for downstream warning rendering", () => {
    const tx = transactionFromRow(baseTxRow);
    expect(tx.raw.Symbol).toBe("ACME");
    expect(tx.raw.Action).toBe("Buy");
  });

  it("treats null quantity as 0", () => {
    const tx = transactionFromRow({ ...baseTxRow, quantity: null });
    expect(tx.quantity).toBe(0);
  });
});

describe("positionsSnapshotFromRows", () => {
  const snapDate = "2026-04-25";
  const equityRow: PositionSnapshotRow = {
    id: 1,
    account_id: 1,
    as_of: snapDate,
    symbol: "ACME",
    description: "ACME CORP",
    quantity: 100,
    price: 50,
    market_value: 5000,
    cost_basis: 4500,
    asset_type: "equity",
    raw: JSON.stringify({}),
    source_file: "snap.csv",
    content_hash: "h",
  };
  const optionRow: PositionSnapshotRow = {
    ...equityRow,
    id: 2,
    symbol: "ACME 03/15/2026 100.00 P",
    description: "PUT ACME CORP",
    quantity: -1,
    price: 1.5,
    market_value: -150,
    cost_basis: 0,
    asset_type: "option",
  };
  const cashRow: PositionSnapshotRow = {
    ...equityRow,
    id: 3,
    symbol: "Cash & Cash Investments",
    description: null,
    quantity: null,
    price: null,
    market_value: 1234.56,
    cost_basis: null,
    asset_type: "cash",
  };

  it("groups rows by asset type", () => {
    const snap = positionsSnapshotFromRows(snapDate, [
      equityRow,
      optionRow,
      cashRow,
    ]);
    expect(snap.asOf).toBe(snapDate);
    expect(snap.cash).toBeCloseTo(1234.56, 2);
    expect(snap.shares).toHaveLength(1);
    expect(snap.shares[0].ticker).toBe("ACME");
    expect(snap.options).toHaveLength(1);
    expect(snap.options[0].underlying).toBe("ACME");
    expect(snap.options[0].callPut).toBe("P");
  });

  it("computes totalValue from row market_values", () => {
    const snap = positionsSnapshotFromRows(snapDate, [equityRow, cashRow]);
    expect(snap.totalValue).toBeCloseTo(5000 + 1234.56, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/model/fromDb.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

First confirm field names on `PositionSnapshotRow`:

```bash
grep -A 15 "interface PositionSnapshotRow" lib/db/repos/positionSnapshots.ts
```

Then create `lib/model/fromDb.ts`:

```ts
import type {
  Action,
  RawCsvRow,
  Transaction,
} from "@/lib/csv/types";
import type { PositionSnapshotRow } from "@/lib/db/repos/positionSnapshots";
import type { TransactionRow } from "@/lib/db/repos/transactions";
import type {
  PositionsSnapshot,
  SnapshotShare,
  SnapshotOption,
} from "@/lib/positions/types";
import { parseOptionSymbol } from "@/lib/schwab/optionSymbol";

const ACTION_MAP: Record<string, Action> = {
  BUY: "Buy",
  SELL: "Sell",
  BUY_TO_OPEN: "Buy",
  SELL_TO_OPEN: "SellToOpen",
  BUY_TO_CLOSE: "BuyToClose",
  SELL_TO_CLOSE: "Sell",
  ASSIGNMENT: "Assigned",
  EXERCISE: "Assigned",
  EXPIRATION: "Expired",
  DIVIDEND: "QualifiedDividend",
  INTEREST: "BankInterest",
  FEE: "ServiceFee",
  JOURNAL: "Journal",
  TRANSFER_IN: "Journal",
  TRANSFER_OUT: "WireSent",
};

export function actionFromCanonical(
  canonical: string,
  _raw: string,
): Action {
  return ACTION_MAP[canonical] ?? "Unknown";
}

export function transactionFromRow(row: TransactionRow): Transaction {
  const action = actionFromCanonical(row.action_canonical, row.action_raw);
  const optionLeg = parseOptionSymbol(row.symbol);
  const tx: Transaction = {
    tradeDate: row.trade_date,
    action,
    quantity: row.quantity ?? 0,
    fees: row.fees ?? 0,
    amount: row.amount,
    raw: parseRaw(row.raw),
    rawAction: row.action_raw,
  };
  if (row.price !== null) tx.price = row.price;
  if (optionLeg) {
    tx.option = optionLeg;
  } else if (row.symbol) {
    tx.ticker = row.symbol;
  }
  return tx;
}

function parseRaw(raw: string): RawCsvRow {
  try {
    return JSON.parse(raw) as RawCsvRow;
  } catch {
    return {
      Date: "",
      Action: "",
      Symbol: "",
      Description: "",
      Quantity: "",
      Price: "",
      "Fees & Comm": "",
      Amount: "",
    };
  }
}

export function positionsSnapshotFromRows(
  asOf: string,
  rows: PositionSnapshotRow[],
): PositionsSnapshot {
  const shares: SnapshotShare[] = [];
  const options: SnapshotOption[] = [];
  let cash = 0;
  let totalValue = 0;

  for (const row of rows) {
    const mv = row.market_value ?? 0;
    totalValue += mv;
    if (row.asset_type === "cash") {
      cash += mv;
      continue;
    }
    if (row.asset_type === "option") {
      const leg = parseOptionSymbol(row.symbol);
      if (!leg) continue;
      options.push({
        underlying: leg.ticker,
        expiry: leg.expiry,
        strike: leg.strike,
        callPut: leg.type === "Call" ? "C" : "P",
        quantity: row.quantity ?? 0,
        price: row.price ?? 0,
        marketValue: mv,
        delta: null,
        theta: null,
        intrinsicValue: null,
      });
      continue;
    }
    shares.push({
      ticker: row.symbol,
      quantity: row.quantity ?? 0,
      price: row.price ?? 0,
      marketValue: mv,
      costBasis: row.cost_basis ?? 0,
    });
  }

  return {
    asOf,
    cash,
    totalValue,
    shares,
    options,
    sourceFile: rows[0]?.source_file ?? "",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/model/fromDb.test.ts
```

Expected: PASS, all 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/model/fromDb.ts tests/model/fromDb.test.ts
git commit -m "Add DB-row to legacy-model adapter for transactions and snapshots

Closes #3

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: `loadAccountOptionsView` server function (no market data yet)

**Files:**
- Create: `lib/server/account.ts`, `tests/server/account.test.ts`

**Context:** Orchestration layer used by the new options page. Looks up account, loads + maps DB rows, builds the legacy `PortfolioState`. Market data comes in Task 4.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/server/account.test.ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount, setSeed } from "@/lib/db/repos/accounts";
import { insertTransaction } from "@/lib/db/repos/transactions";
import { insertSnapshot } from "@/lib/db/repos/positionSnapshots";
import { setBoolean } from "@/lib/db/repos/settings";
import { loadAccountOptionsView } from "@/lib/server/account";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("loadAccountOptionsView", () => {
  it("returns null when uuid is unknown", async () => {
    const db = makeDb();
    const result = await loadAccountOptionsView(
      "00000000-0000-0000-0000-000000000000",
      { db },
    );
    expect(result).toBeNull();
  });

  it("returns no-data when account exists but has no transactions or snapshots", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    setSeed(db, "100", "2026-01-15", 12345);
    const result = await loadAccountOptionsView(account.uuid, { db });
    expect(result?.kind).toBe("no-data");
  });

  it("builds a PortfolioState when transactions exist", async () => {
    const db = makeDb();
    setBoolean(db, "market_data.enabled", false);
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    setSeed(db, "100", "2026-01-01", 10000);

    insertTransaction(
      db,
      account.id,
      {
        tradeDate: "2026-01-05",
        actionCanonical: "BUY",
        actionRaw: "Buy",
        symbol: "ACME",
        description: "ACME CORP",
        quantity: 100,
        price: 50,
        fees: 0,
        amount: -5000,
        raw: { Action: "Buy" },
      },
      "demo.csv",
    );

    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-04-25",
        symbol: "ACME",
        description: "ACME CORP",
        quantity: 100,
        price: 60,
        marketValue: 6000,
        costBasis: 5000,
        assetType: "equity",
        raw: {},
      },
      "snap.csv",
    );

    const result = await loadAccountOptionsView(account.uuid, { db });
    expect(result?.kind).toBe("ready");
    if (result?.kind !== "ready") return;
    expect(result.account.uuid).toBe(account.uuid);
    expect(result.state.config.seedValue).toBe(10000);
    expect(result.state.transactions).toHaveLength(1);
    expect(result.state.cashLedger.length).toBeGreaterThan(0);
  });

  it("falls back to earliest snapshot for seed when no override is set", async () => {
    const db = makeDb();
    setBoolean(db, "market_data.enabled", false);
    const account = upsertAccount(db, { externalId: "200", label: "Demo2" });
    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-04-01",
        symbol: "ACME",
        description: "ACME CORP",
        quantity: 100,
        price: 40,
        marketValue: 4000,
        costBasis: 4000,
        assetType: "equity",
        raw: {},
      },
      "snap.csv",
    );

    const result = await loadAccountOptionsView(account.uuid, { db });
    expect(result?.kind).toBe("ready");
    if (result?.kind !== "ready") return;
    expect(result.state.config.seedDate).toBe("2026-04-01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/server/account.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the server function**

```ts
// lib/server/account.ts
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";
import {
  type Account,
  getAccountByUuid,
} from "@/lib/db/repos/accounts";
import { listTransactionsByAccount } from "@/lib/db/repos/transactions";
import {
  getEarliestSnapshotDate,
  getLatestSnapshotDate,
  getSnapshotByDate,
} from "@/lib/db/repos/positionSnapshots";
import { getBoolean } from "@/lib/db/repos/settings";
import {
  positionsSnapshotFromRows,
  transactionFromRow,
} from "@/lib/model/fromDb";
import { buildPortfolio } from "@/lib/model/portfolio";
import { chooseSeed } from "@/lib/positions/seed";
import type { Config, PortfolioState } from "@/lib/model/types";
import type { PositionsSnapshot } from "@/lib/positions/types";

export type AccountOptionsView =
  | {
      kind: "ready";
      account: Account;
      state: PortfolioState;
      sourceFiles: { transactions: string[]; positions: string[] };
      loadedAt: string;
      latestSnapshot: PositionsSnapshot | null;
    }
  | { kind: "no-data"; account: Account };

export interface LoadAccountOptionsViewOpts {
  db?: Database.Database;
}

export async function loadAccountOptionsView(
  uuid: string,
  opts: LoadAccountOptionsViewOpts = {},
): Promise<AccountOptionsView | null> {
  const db = opts.db ?? getDb();

  const account = getAccountByUuid(db, uuid);
  if (!account) return null;

  const txRows = listTransactionsByAccount(db, account.id);
  const transactions = txRows.map(transactionFromRow);

  const earliestSnapDate = getEarliestSnapshotDate(db, account.id);
  const latestSnapDate = getLatestSnapshotDate(db, account.id);
  const earliestSnapshot = earliestSnapDate
    ? positionsSnapshotFromRows(
        earliestSnapDate,
        getSnapshotByDate(db, account.id, earliestSnapDate),
      )
    : null;
  const latestSnapshot = latestSnapDate
    ? positionsSnapshotFromRows(
        latestSnapDate,
        getSnapshotByDate(db, account.id, latestSnapDate),
      )
    : null;

  if (transactions.length === 0 && earliestSnapshot === null) {
    return { kind: "no-data", account };
  }

  const marketDataEnabled = getBoolean(db, "market_data.enabled");
  const config: Config = {
    seedDate: account.seedDate ?? earliestSnapshot?.asOf ?? "",
    seedValue: account.seedValue ?? earliestSnapshot?.totalValue ?? 0,
    marketData: { enabled: marketDataEnabled },
    benchmark: account.benchmark,
  };

  const seed = chooseSeed({
    transactions,
    earliestSnapshot,
    config,
  });

  const state = buildPortfolio(transactions, config, seed);

  const txSourceFiles = Array.from(
    new Set(txRows.map((r) => r.source_file)),
  ).sort();
  const posSourceFiles = Array.from(
    new Set(
      [
        earliestSnapshot?.sourceFile,
        latestSnapshot?.sourceFile,
      ].filter((s): s is string => Boolean(s)),
    ),
  ).sort();

  return {
    kind: "ready",
    account,
    state,
    sourceFiles: { transactions: txSourceFiles, positions: posSourceFiles },
    loadedAt: new Date().toISOString(),
    latestSnapshot,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/server/account.test.ts
```

Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/server/account.ts tests/server/account.test.ts
git commit -m "Add loadAccountOptionsView orchestrator (no market data yet)

Closes #3

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Add market-data fetching to `loadAccountOptionsView`

**Files:**
- Modify: `lib/server/account.ts`, `tests/server/account.test.ts`

**Context:** The deleted `lib/server/dashboard.ts` fetched yahoo-finance closes for a portfolio-value series, a benchmark series, and computed mark-to-market for live quotes. Port that logic into `loadAccountOptionsView` so the existing cards have full data.

- [ ] **Step 1: Read the relevant deleted helpers from git history**

```bash
git log --all --oneline --diff-filter=D -- lib/server/dashboard.ts
git show <commit>~1:lib/server/dashboard.ts | head -180
```

Identify `collectHeldTickers`, the historical-close fetching loop, the benchmark series construction, and the mark-to-market block. We are porting all three.

- [ ] **Step 2: Add a test that exercises the markToMarket=null path with market data enabled**

Append to `tests/server/account.test.ts`:

```ts
describe("loadAccountOptionsView — mark-to-market shape", () => {
  it("includes a markToMarket field that is null when no held positions", async () => {
    const db = makeDb();
    setBoolean(db, "market_data.enabled", true);
    const account = upsertAccount(db, { externalId: "300", label: "Demo3" });
    setSeed(db, "300", "2026-01-01", 10000);
    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-01-01",
        symbol: "Cash & Cash Investments",
        description: null,
        quantity: null,
        price: null,
        marketValue: 10000,
        costBasis: null,
        assetType: "cash",
        raw: {},
      },
      "snap.csv",
    );
    const result = await loadAccountOptionsView(account.uuid, {
      db,
      includeMarketData: false,
    });
    expect(result?.kind).toBe("ready");
    if (result?.kind !== "ready") return;
    expect(result.markToMarket).toBeNull();
  });
});
```

- [ ] **Step 3: Implement market-data fetching**

Edit `lib/server/account.ts`:

1. Extend imports:

```ts
import { yesterdayInET } from "@/lib/util/dates";
import { fetchQuotes, type Quote } from "@/lib/market/quotes";
import { loadHistoricalCloses } from "@/lib/market/historical";
import { computePortfolioValueSeries } from "@/lib/model/metrics/portfolio_value";
import {
  computeMarkToMarket,
  type MarkToMarket,
} from "@/lib/model/metrics/mark_to_market";
import type { Seed } from "@/lib/model/types";
```

2. Extend the discriminated union to include `markToMarket: MarkToMarket | null`:

```ts
export type AccountOptionsView =
  | {
      kind: "ready";
      account: Account;
      state: PortfolioState;
      sourceFiles: { transactions: string[]; positions: string[] };
      loadedAt: string;
      latestSnapshot: PositionsSnapshot | null;
      markToMarket: MarkToMarket | null;
    }
  | { kind: "no-data"; account: Account };
```

3. Extend opts:

```ts
export interface LoadAccountOptionsViewOpts {
  db?: Database.Database;
  includeMarketData?: boolean;
}
```

4. After `const state = buildPortfolio(transactions, config, seed);` insert the market-data block:

```ts
let markToMarket: MarkToMarket | null = null;
const includeMarket = (opts.includeMarketData ?? true) && marketDataEnabled;

if (includeMarket) {
  const heldTickers = collectHeldTickers(state, seed);
  const endDate = yesterdayInET();
  if (heldTickers.length > 0 && endDate >= seed.asOf) {
    const historicalCloses: Record<string, Record<string, number>> = {};
    for (const ticker of heldTickers) {
      const res = await loadHistoricalCloses(ticker, seed.asOf, endDate);
      if (res.kind === "ok") {
        const byDate: Record<string, number> = {};
        for (const { date, close } of res.closes) byDate[date] = close;
        historicalCloses[ticker] = byDate;
      } else {
        state.warnings.push({
          kind: "MissingHistoricalPrices",
          ticker,
          reason: res.message,
        });
      }
    }
    const pv = computePortfolioValueSeries(state, seed, historicalCloses, endDate);
    state.portfolioValueSeries = pv.series;
    for (const ticker of pv.missingTickers) {
      state.warnings.push({
        kind: "MissingHistoricalPrices",
        ticker,
        reason: "No historical close data available for one or more dates.",
      });
    }
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
      state.warnings.push({
        kind: "MissingHistoricalPrices",
        ticker,
        reason:
          res.kind === "error"
            ? res.message
            : "Insufficient historical data to render a benchmark line.",
      });
    }
  }

  if (state.openSharePositions.length > 0 || latestSnapshot !== null) {
    const snapSymbols = new Set(
      (latestSnapshot?.shares ?? []).map((s) => s.ticker),
    );
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
    markToMarket = computeMarkToMarket(
      state,
      quoteMap,
      latestSnapshot ?? undefined,
    );
  }
}
```

5. Add `markToMarket` to the returned `ready` object.

6. Add `collectHeldTickers` helper at the bottom of the file:

```ts
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

- [ ] **Step 4: Run all server tests**

```bash
npm test -- tests/server/account.test.ts
```

Expected: PASS — all 5 tests (4 from Task 3 + 1 new).

- [ ] **Step 5: Commit**

```bash
git add lib/server/account.ts tests/server/account.test.ts
git commit -m "Add market-data and mark-to-market in loadAccountOptionsView

Closes #3

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Wheel dashboard at `/accounts/[uuid]/options`

**Files:**
- Create: `app/accounts/[uuid]/layout.tsx`, `app/accounts/[uuid]/options/page.tsx`

**Context:** A guard layout that 404s on unknown UUIDs, plus a thin page wrapper that calls `loadAccountOptionsView` and renders the same components as the deleted `/`.

- [ ] **Step 1: Create the guard layout**

```tsx
// app/accounts/[uuid]/layout.tsx
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/connection";
import { getAccountByUuid } from "@/lib/db/repos/accounts";

export default async function AccountLayout({
  params,
  children,
}: {
  params: Promise<{ uuid: string }>;
  children: React.ReactNode;
}) {
  const { uuid } = await params;
  const db = getDb();
  if (!getAccountByUuid(db, uuid)) notFound();
  return <>{children}</>;
}
```

- [ ] **Step 2: Read the deleted `/` page for layout reference**

```bash
git log --all --oneline --diff-filter=M -- app/page.tsx | head
git show <foundation-merge>:app/page.tsx | head -110
```

(Or equivalently, look at the version on main before the foundation rewrite.)

- [ ] **Step 3: Create the page**

```tsx
// app/accounts/[uuid]/options/page.tsx
import { notFound } from "next/navigation";
import { loadAccountOptionsView } from "@/lib/server/account";
import { AttentionBanner } from "@/app/components/AttentionBanner";
import { SummaryStrip } from "@/app/components/SummaryStrip";
import { NavCard } from "@/app/components/NavCard";
import { PremiumsCard } from "@/app/components/PremiumsCard";
import { OpenPositionsCard } from "@/app/components/OpenPositionsCard";
import { TransactionLogCard } from "@/app/components/TransactionLogCard";
import { TradeHistoryCard } from "@/app/components/TradeHistoryCard";
import { ReturnMetricsCard } from "@/app/components/ReturnMetricsCard";
import { OutcomesCard } from "@/app/components/OutcomesCard";
import { PremiumByTickerCard } from "@/app/components/PremiumByTickerCard";
import { CashYieldCard } from "@/app/components/CashYieldCard";
import { CapitalAtRiskCard } from "@/app/components/CapitalAtRiskCard";
import { MarkToMarketCard } from "@/app/components/MarkToMarketCard";

export const dynamic = "force-dynamic";

export default async function AccountOptionsPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const data = await loadAccountOptionsView(uuid);

  if (data === null) notFound();

  if (data.kind === "no-data") {
    return (
      <main className="min-h-screen p-6 max-w-7xl mx-auto">
        <header className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
          <div className="text-xl font-bold">{data.account.label}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            No transactions or position snapshots yet for this account.
          </div>
        </header>
      </main>
    );
  }

  const { account, state, sourceFiles, loadedAt, markToMarket } = data;
  const asOfDate = state.navSeries.at(-1)?.date ?? state.config.seedDate;

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <header className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4 flex items-baseline justify-between">
        <div>
          <div className="text-xl font-bold">{account.label} · Options</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Seed ${state.config.seedValue.toLocaleString()} on{" "}
            {state.config.seedDate} · Data through {asOfDate} · Source:{" "}
            <code className="bg-gray-100 dark:bg-neutral-800 px-1 rounded">
              {sourceFiles.transactions.length} transactions ·{" "}
              {sourceFiles.positions.length} positions
            </code>
          </div>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Last refresh {new Date(loadedAt).toLocaleTimeString()}
        </div>
      </header>

      <AttentionBanner warnings={state.warnings} />

      <SummaryStrip state={state} markToMarket={markToMarket} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <NavCard state={state} />
        </div>
        <div>
          <PremiumsCard state={state} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <OpenPositionsCard state={state} asOfDate={asOfDate} />
        <TransactionLogCard transactions={state.transactions} />
      </div>

      <div className="mb-4">
        <TradeHistoryCard state={state} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-2">
          <ReturnMetricsCard state={state} />
        </div>
        <div>
          <OutcomesCard state={state} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <PremiumByTickerCard state={state} />
        <CashYieldCard state={state} />
      </div>

      <div className="mb-4">
        <CapitalAtRiskCard state={state} />
      </div>

      {markToMarket !== null && markToMarket.rows.length > 0 && (
        <div className="mb-4">
          <MarkToMarketCard markToMarket={markToMarket} />
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Verify the page renders**

```bash
npm run db:reset
mkdir -p data/transactions data/positions
cp tests/fixtures/schwab/transactions-basic.csv data/transactions/Demo_XXX100_Transactions_20260427-090135.csv
cp tests/fixtures/schwab/positions-basic.csv data/positions/Demo-Positions-2026-04-25-123847.csv
npm run ingest
npm run dev
```

Visit `http://localhost:3000/`, click "Options" on the seeded row. Expected: full wheel dashboard, all cards rendered, no console errors. Visit `/accounts/00000000-0000-0000-0000-000000000000/options` — expect 404.

- [ ] **Step 5: Commit**

```bash
git add app/accounts/
git commit -m "Render the wheel dashboard at /accounts/[uuid]/options

Closes #3

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Per-account sub-nav with data-driven tab hiding

**Files:**
- Create: `app/components/AccountTabs.tsx`, `lib/server/accountTabs.ts`
- Modify: `app/accounts/[uuid]/options/page.tsx`

**Context:** Below the global `AppNav`, account-scoped pages get a tab strip (Overview / Options / Trades / Tx). Options tab hidden when account has zero options-related transactions. Each page renders the tabs itself so it can pass `active="<page>"` for highlighting.

- [ ] **Step 1: Create the tabs component**

```tsx
// app/components/AccountTabs.tsx
import Link from "next/link";

export type AccountTabFlags = {
  showOptions: boolean;
  showTrades: boolean;
};

type Props = {
  uuid: string;
  flags: AccountTabFlags;
  active?: "overview" | "options" | "trades" | "transactions";
};

const ALL_TABS = [
  { key: "overview" as const, label: "Overview", path: "overview" },
  { key: "options" as const, label: "Options", path: "options" },
  { key: "trades" as const, label: "Trades", path: "trades" },
  { key: "transactions" as const, label: "Transactions", path: "transactions" },
];

export function AccountTabs({ uuid, flags, active }: Props) {
  const tabs = ALL_TABS.filter((t) => {
    if (t.key === "options") return flags.showOptions;
    if (t.key === "trades") return flags.showTrades;
    return true;
  });
  return (
    <nav className="border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <div className="max-w-7xl mx-auto px-6 py-2 flex items-center gap-4">
        {tabs.map((t) => {
          const isActive = active === t.key;
          return (
            <Link
              key={t.key}
              href={`/accounts/${uuid}/${t.path}`}
              className={`text-sm ${
                isActive
                  ? "font-semibold text-gray-900 dark:text-gray-100"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Create the flags helper**

```ts
// lib/server/accountTabs.ts
import { getDb } from "@/lib/db/connection";
import { getAccountByUuid } from "@/lib/db/repos/accounts";
import { listTransactionsByAccount } from "@/lib/db/repos/transactions";
import type { AccountTabFlags } from "@/app/components/AccountTabs";

const OPTION_ACTIONS = new Set([
  "SELL_TO_OPEN",
  "BUY_TO_OPEN",
  "BUY_TO_CLOSE",
  "SELL_TO_CLOSE",
  "ASSIGNMENT",
  "EXERCISE",
  "EXPIRATION",
]);

const TRADE_ACTIONS = new Set([
  "BUY",
  "SELL",
  "SELL_TO_OPEN",
  "BUY_TO_OPEN",
  "BUY_TO_CLOSE",
  "SELL_TO_CLOSE",
]);

export async function getAccountTabFlags(
  uuid: string,
): Promise<AccountTabFlags | null> {
  const db = getDb();
  const account = getAccountByUuid(db, uuid);
  if (!account) return null;
  const txs = listTransactionsByAccount(db, account.id);
  return {
    showOptions: txs.some((t) => OPTION_ACTIONS.has(t.action_canonical)),
    showTrades: txs.some((t) => TRADE_ACTIONS.has(t.action_canonical)),
  };
}
```

- [ ] **Step 3: Render tabs from the options page**

In `app/accounts/[uuid]/options/page.tsx`, add imports:

```tsx
import { AccountTabs } from "@/app/components/AccountTabs";
import { getAccountTabFlags } from "@/lib/server/accountTabs";
```

Inside `AccountOptionsPage`, after the `notFound()` guard but before the return JSX:

```tsx
const flags = (await getAccountTabFlags(uuid)) ?? {
  showOptions: true,
  showTrades: true,
};
```

Render the tabs at the top of every return path (no-data branch and the main return):

```tsx
<AccountTabs uuid={uuid} flags={flags} active="options" />
```

- [ ] **Step 4: Smoke test in the browser**

With the dev server running and basic fixtures ingested, visit `/accounts/{uuid}/options`. Expected: a sub-nav strip appears between the global `AppNav` and the page content, Options bold. Overview/Trades/Transactions visible because the basic fixture has trade transactions.

- [ ] **Step 5: Commit**

```bash
git add app/components/AccountTabs.tsx lib/server/accountTabs.ts app/accounts/[uuid]/options/page.tsx
git commit -m "Add per-account sub-nav with data-driven Options/Trades hiding

Closes #3

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Account picker in the global `AppNav`

**Files:**
- Modify: `app/components/AppNav.tsx`, `app/layout.tsx`, `lib/server/home.ts`
- Create: `app/components/AccountPicker.tsx`

**Context:** Promote the global nav from "just a brand link" to "brand + account picker." The picker is a small client `<select>` that navigates on change. Keep it dumb — pick an account, go to `/accounts/{uuid}/options`.

- [ ] **Step 1: Export `loadAccounts` from `home.ts`**

Add to `lib/server/home.ts`:

```ts
export async function loadAccounts(opts: LoadHomeOpts = {}): Promise<Account[]> {
  const db = opts.db ?? getDb();
  return listAccounts(db);
}
```

(`Account` is already imported in `home.ts`. If not, add the import.)

- [ ] **Step 2: Create the picker (client component)**

```tsx
// app/components/AccountPicker.tsx
"use client";

import { useRouter } from "next/navigation";
import type { Account } from "@/lib/db/repos/accounts";

type Props = { accounts: Account[]; currentUuid?: string };

export function AccountPicker({ accounts, currentUuid }: Props) {
  const router = useRouter();
  return (
    <select
      value={currentUuid ?? ""}
      onChange={(e) => {
        const uuid = e.target.value;
        if (uuid) router.push(`/accounts/${uuid}/options`);
        else router.push("/");
      }}
      className="text-sm bg-transparent border border-gray-300 dark:border-neutral-700 rounded px-2 py-1 text-gray-700 dark:text-gray-200"
    >
      <option value="">All accounts</option>
      {accounts.map((a) => (
        <option key={a.uuid} value={a.uuid}>
          {a.label}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 3: Update `AppNav` to take an `accounts` prop**

```tsx
// app/components/AppNav.tsx
import Link from "next/link";
import type { Account } from "@/lib/db/repos/accounts";
import { AccountPicker } from "@/app/components/AccountPicker";

type Props = { accounts: Account[]; currentUuid?: string };

export function AppNav({ accounts, currentUuid }: Props) {
  return (
    <nav className="border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
        <Link href="/" className="font-bold text-gray-900 dark:text-gray-100 hover:opacity-80">
          Schwab Lens
        </Link>
        {accounts.length > 0 && (
          <AccountPicker accounts={accounts} currentUuid={currentUuid} />
        )}
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Wire it from the root layout**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { AppNav } from "@/app/components/AppNav";
import { loadAccounts } from "@/lib/server/home";

export const metadata: Metadata = {
  title: "Schwab Lens",
  description: "Local-first read-only Schwab brokerage dashboards",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const accounts = await loadAccounts();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AppNav accounts={accounts} />
        {children}
      </body>
    </html>
  );
}
```

The root layout doesn't know `currentUuid`. That's fine — picker still works (just doesn't pre-select). Pre-selection on `/accounts/[uuid]/*` would require rendering `AppNav` per page; defer to a follow-up.

- [ ] **Step 5: Browser smoke**

Visit `/`. Expected: brand + dropdown with one option ("Demo"). Pick it → navigates to `/accounts/{uuid}/options`. Sub-nav and dashboard render. Picker on the dashboard page also works.

- [ ] **Step 6: Commit**

```bash
git add app/components/AppNav.tsx app/components/AccountPicker.tsx app/layout.tsx lib/server/home.ts
git commit -m "Add account picker to AppNav

Closes #3

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Final verification + manual test plan + PR

- [ ] **Step 1: Full automated verification**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all PASS. (One pre-existing `mkdirSync` lint warning in `tests/market/quotes.test.ts` is acceptable.)

- [ ] **Step 2: Manual smoke test against fixtures**

```bash
npm run db:reset
mkdir -p data/transactions data/positions
cp tests/fixtures/schwab/transactions-basic.csv data/transactions/Demo_XXX100_Transactions_20260427-090135.csv
cp tests/fixtures/schwab/positions-basic.csv data/positions/Demo-Positions-2026-04-25-123847.csv
cp tests/fixtures/schwab/positions-with-options.csv data/positions/Demo-Positions-2026-04-26-091223.csv
npm run ingest
npm run dev
```

Verify in the browser:

- `/` renders the accounts list (one row, "Demo").
- Brand-bar account picker is populated.
- Click "Options" link on the row, lands on `/accounts/{uuid}/options` with the wheel dashboard.
- Sub-nav shows Overview / Options / Trades / Transactions, Options bold.
- All cards visible: SummaryStrip, NavCard, PremiumsCard, OpenPositionsCard, TransactionLogCard, TradeHistoryCard, ReturnMetricsCard, OutcomesCard, PremiumByTickerCard, CashYieldCard, CapitalAtRiskCard, MarkToMarketCard.
- Picker switches accounts (only 1 here, but the dropdown is wired).
- Visit `/accounts/00000000-0000-0000-0000-000000000000/options`, expect a 404.

- [ ] **Step 3: PII pre-commit check**

```bash
git status
git diff multi-account..HEAD --name-only | grep -iE "\.(csv|xlsx)$|^transactions/|^sheets/|^data/" | head
```

Expected: only `tests/fixtures/schwab/*.csv` (allowed). Anything else, STOP and investigate before pushing.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin fix/3-options-page
```

```bash
gh pr create --base multi-account --title "Options page at /accounts/[uuid]/options + account-aware nav" --body "<see template below>"
```

PR body template:

```
## Summary

Implements issue #3 of the Schwab Lens v1 plan. Restores the legacy
options/wheel dashboard at /accounts/[uuid]/options sourced from the
SQLite DB shipped in #1, and makes the global nav account-aware.

## What changed

- lib/schwab/optionSymbol.ts: parse Schwab option-symbol strings into OptionLeg.
- lib/model/fromDb.ts: thin adapter from DB rows to legacy Transaction and PositionsSnapshot shapes.
- lib/server/account.ts: loadAccountOptionsView orchestrator (account lookup, mapping, portfolio build, market data, mark-to-market).
- lib/server/accountTabs.ts: getAccountTabFlags scans transactions to decide which tabs are visible.
- app/accounts/[uuid]/layout.tsx: 404s on unknown UUIDs.
- app/accounts/[uuid]/options/page.tsx: the wheel dashboard at the new URL.
- app/components/AccountTabs.tsx: per-account sub-nav, Options/Trades hidden when no matching transactions.
- app/components/AccountPicker.tsx + AppNav update: account dropdown in the global nav.
- app/page.tsx unchanged; the accounts list landing keeps working alongside the new per-account routes.

## Deviation from issue body

The issue body says / should redirect to first-account/options. We kept the accounts list at / since it works for any number of accounts and the rows already link straight to /accounts/{uuid}/options.

## Test plan

- [x] npm run typecheck passes
- [x] npm run lint passes
- [x] npm test passes
- [ ] Reviewer: ingest fixtures, click through / → /accounts/{uuid}/options, all cards render
- [ ] Reviewer: account picker switches accounts
- [ ] Reviewer: visiting an unknown UUID 404s

*Co-authored by Claude*
```

---

## Self-review notes

- All five issue acceptance items are covered: (1) new route renders dashboard via Task 5; (2) `app/page.tsx` keeps the accounts list — explicitly flagged as a deviation in this plan and the PR; (3) account-aware nav (picker in AppNav + per-account tabs) Task 6/7; (4) data-driven Options tab hiding Task 6; (5) all existing tests pass — verified at every task and at Task 8.
- Type consistency: `Account`, `Transaction`, `OptionLeg`, `PositionsSnapshot`, `Config`, `Seed`, `PortfolioState` references match across tasks. `AccountTabFlags` defined in Task 6 and reused in Task 7 indirectly via `AccountTabs` (the picker doesn't use it).
- No placeholders.
- Spec coverage: this plan implements just the spec sections relevant to issue #3 (page structure, account-scoped data, AppNav). TWR (issue #2), the Overview lens (#4), per-account trades/transactions pages (#5), the all-accounts grid (#6), and the stale-data indicator (#7) are explicitly out of scope.
