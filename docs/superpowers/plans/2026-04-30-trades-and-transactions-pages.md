# Issue #5 Trades and Transactions Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-account `/accounts/[uuid]/trades` and `/accounts/[uuid]/transactions` pages that reuse the existing `TradesPageClient` and `TransactionsPageClient` UI, fed by account-scoped data.

**Architecture:** Two new server-rendered page components, each backed by a small new loader (`lib/server/accountTrades.ts`, `lib/server/accountTransactions.ts`). The loaders read transactions for the account from the DB, map them to the legacy `Transaction[]` shape via the existing `transactionFromRow` adapter, and (for trades) run them through the pure `computeClosedTrades` function. Client components are minimally modified to accept a `uuid` prop so URL-synced filter state writes back to the account-scoped path.

**Tech Stack:** Next.js 16 App Router (TypeScript), better-sqlite3, vitest, Tailwind CSS.

**Spec:** [`docs/superpowers/specs/2026-04-27-schwab-lens-design.md`](../specs/2026-04-27-schwab-lens-design.md), section "/accounts/[uuid]/trades and /accounts/[uuid]/transactions".

**Issue:** [#5](https://github.com/jayrav13/schwab-lens/issues/5).

---

## Scope notes

- The legacy `/trades` and `/transactions` routes were removed in PR #17 (issue #1). Nothing to delete.
- `AccountTabs` already declares `trades` and `transactions` keys with the correct hrefs (`app/components/AccountTabs.tsx:11-19`). No change needed there.
- `getAccountTabFlags` already computes `showTrades` (`lib/server/accountTabs.ts:25-36`). The current `TRADE_ACTIONS` set includes `BUY`/`SELL` even though `computeClosedTrades` ignores equity rows — equity-only accounts will see the Trades tab and an empty page. That's a pre-existing discrepancy; out of scope for this issue (file as follow-up if it surfaces).
- The two client components (`TradesPageClient`, `TransactionsPageClient`) currently `router.replace` to hardcoded `/trades` and `/transactions` paths. They must be updated to write to the account-scoped path.

---

## File Structure

**New files:**
- `lib/server/accountTransactions.ts` — `loadAccountTransactionsView(uuid, opts?)`
- `lib/server/accountTrades.ts` — `loadAccountTradesView(uuid, opts?)`
- `tests/server/accountTransactions.test.ts`
- `tests/server/accountTrades.test.ts`
- `app/accounts/[uuid]/transactions/page.tsx`
- `app/accounts/[uuid]/trades/page.tsx`

**Modified files:**
- `app/components/TransactionsPageClient.tsx` — accept `uuid: string` prop; build URL as `/accounts/${uuid}/transactions[?qs]`
- `app/components/TradesPageClient.tsx` — accept `uuid: string` prop; build URL as `/accounts/${uuid}/trades[?qs]`

**Boundary:** loaders are the only place that touch the DB. Pages are thin: call loader, call `getAccountTabFlags`, render `AccountTabs` + a header + the existing client component. Client components stay presentational.

---

## Branch and PR plan

Branch: `fix/5-trades-and-transactions-pages` from `multi-account` (per memory: PRs target `multi-account`, not `main`). Each task ends with a commit; the final task opens the PR.

---

## Task 1: Set up branch

**Files:** none (git only).

- [ ] **Step 1: Confirm clean tree on `multi-account`**

```bash
git checkout multi-account
git status
```
Expected: `On branch multi-account` and `nothing to commit, working tree clean`.

- [ ] **Step 2: Pull latest**

```bash
git pull --ff-only origin multi-account
```
Expected: `Already up to date.` or a fast-forward.

- [ ] **Step 3: Create branch**

```bash
git checkout -b fix/5-trades-and-transactions-pages
```

---

## Task 2: Transactions loader (TDD)

A pure-ish data loader: fetches the account by UUID, lists its transactions, maps them through `transactionFromRow`. Returns `null` for unknown accounts.

**Files:**
- Create: `lib/server/accountTransactions.ts`
- Test: `tests/server/accountTransactions.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/server/accountTransactions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import { insertTransaction } from "@/lib/db/repos/transactions";
import { loadAccountTransactionsView } from "@/lib/server/accountTransactions";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("loadAccountTransactionsView", () => {
  it("returns null when uuid is unknown", async () => {
    const db = makeDb();
    const result = await loadAccountTransactionsView(
      "00000000-0000-0000-0000-000000000000",
      { db },
    );
    expect(result).toBeNull();
  });

  it("returns the account with an empty list when no transactions exist", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    const result = await loadAccountTransactionsView(account.uuid, { db });
    expect(result).not.toBeNull();
    expect(result?.account.uuid).toBe(account.uuid);
    expect(result?.transactions).toEqual([]);
  });

  it("returns transactions in trade-date desc order with mapped fields", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    insertTransaction(
      db,
      account.id,
      {
        tradeDate: "2026-01-05",
        actionCanonical: "BUY",
        actionRaw: "Buy",
        symbol: "ACME",
        description: "ACME CORP",
        quantity: 10,
        price: 50,
        fees: 0,
        amount: -500,
        raw: { Action: "Buy" },
      },
      "demo.csv",
    );
    insertTransaction(
      db,
      account.id,
      {
        tradeDate: "2026-02-10",
        actionCanonical: "SELL",
        actionRaw: "Sell",
        symbol: "ACME",
        description: "ACME CORP",
        quantity: 10,
        price: 60,
        fees: 0,
        amount: 600,
        raw: { Action: "Sell" },
      },
      "demo.csv",
    );

    const result = await loadAccountTransactionsView(account.uuid, { db });
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].tradeDate).toBe("2026-02-10");
    expect(result.transactions[0].action).toBe("Sell");
    expect(result.transactions[1].tradeDate).toBe("2026-01-05");
    expect(result.transactions[1].action).toBe("Buy");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/server/accountTransactions.test.ts
```
Expected: FAIL with `Cannot find module '@/lib/server/accountTransactions'` or similar.

- [ ] **Step 3: Implement the loader**

`lib/server/accountTransactions.ts`:

```ts
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";
import { type Account, getAccountByUuid } from "@/lib/db/repos/accounts";
import { listTransactionsByAccount } from "@/lib/db/repos/transactions";
import { transactionFromRow } from "@/lib/model/fromDb";
import type { Transaction } from "@/lib/csv/types";

export type AccountTransactionsView = {
  account: Account;
  transactions: Transaction[];
};

export interface LoadAccountTransactionsViewOpts {
  db?: Database.Database;
}

export async function loadAccountTransactionsView(
  uuid: string,
  opts: LoadAccountTransactionsViewOpts = {},
): Promise<AccountTransactionsView | null> {
  const db = opts.db ?? getDb();
  const account = getAccountByUuid(db, uuid);
  if (!account) return null;

  const rows = listTransactionsByAccount(db, account.id);
  const transactions = rows
    .map(transactionFromRow)
    .sort((a, b) =>
      a.tradeDate < b.tradeDate ? 1 : a.tradeDate > b.tradeDate ? -1 : 0,
    );

  return { account, transactions };
}
```

- [ ] **Step 4: Verify the test passes**

```bash
npm test -- tests/server/accountTransactions.test.ts
```
Expected: 3 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/server/accountTransactions.ts tests/server/accountTransactions.test.ts
git commit -m "Add loadAccountTransactionsView loader

Returns transactions for an account (mapped through the legacy
transactionFromRow adapter) sorted desc by trade date. Returns null
for unknown UUIDs. Used by the new /accounts/[uuid]/transactions
page in issue #5.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Trades loader (TDD)

Same shape, but runs the transactions through `computeClosedTrades` and returns the resulting `ClosedTrade[]`. `computeClosedTrades` is options-only (filters `t.option != null`); equity-only accounts will get an empty list — that's the existing behavior and matches what the legacy `/trades` page produced.

**Files:**
- Create: `lib/server/accountTrades.ts`
- Test: `tests/server/accountTrades.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/server/accountTrades.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import { insertTransaction } from "@/lib/db/repos/transactions";
import { loadAccountTradesView } from "@/lib/server/accountTrades";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("loadAccountTradesView", () => {
  it("returns null when uuid is unknown", async () => {
    const db = makeDb();
    const result = await loadAccountTradesView(
      "00000000-0000-0000-0000-000000000000",
      { db },
    );
    expect(result).toBeNull();
  });

  it("returns the account with an empty list when there are no option transactions", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    insertTransaction(
      db,
      account.id,
      {
        tradeDate: "2026-01-05",
        actionCanonical: "BUY",
        actionRaw: "Buy",
        symbol: "ACME",
        description: "ACME CORP",
        quantity: 10,
        price: 50,
        fees: 0,
        amount: -500,
        raw: { Action: "Buy" },
      },
      "demo.csv",
    );
    const result = await loadAccountTradesView(account.uuid, { db });
    expect(result).not.toBeNull();
    expect(result?.account.uuid).toBe(account.uuid);
    expect(result?.closedTrades).toEqual([]);
  });

  it("returns one closed trade for a SellToOpen + Expired pair", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "200", label: "Wheel" });
    insertTransaction(
      db,
      account.id,
      {
        tradeDate: "2026-01-05",
        actionCanonical: "SELL_TO_OPEN",
        actionRaw: "Sell to Open",
        symbol: "ACME 02/20/2026 100.00 P",
        description: "PUT ACME CORP $100 EXP 02/20/26",
        quantity: 1,
        price: 1.5,
        fees: 0,
        amount: 150,
        raw: { Action: "Sell to Open" },
      },
      "demo.csv",
    );
    insertTransaction(
      db,
      account.id,
      {
        tradeDate: "2026-02-20",
        actionCanonical: "EXPIRATION",
        actionRaw: "Expired",
        symbol: "ACME 02/20/2026 100.00 P",
        description: "PUT ACME CORP $100 EXP 02/20/26",
        quantity: 1,
        price: 0,
        fees: 0,
        amount: 0,
        raw: { Action: "Expired" },
      },
      "demo.csv",
    );

    const result = await loadAccountTradesView(account.uuid, { db });
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.closedTrades).toHaveLength(1);
    expect(result.closedTrades[0].outcome).toBe("Expired");
    expect(result.closedTrades[0].contract.ticker).toBe("ACME");
    expect(result.closedTrades[0].contract.strike).toBe(100);
    expect(result.closedTrades[0].contract.type).toBe("Put");
    expect(result.closedTrades[0].netPnL).toBeCloseTo(150);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/server/accountTrades.test.ts
```
Expected: FAIL with `Cannot find module '@/lib/server/accountTrades'`.

- [ ] **Step 3: Implement the loader**

`lib/server/accountTrades.ts`:

```ts
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";
import { type Account, getAccountByUuid } from "@/lib/db/repos/accounts";
import { listTransactionsByAccount } from "@/lib/db/repos/transactions";
import { transactionFromRow } from "@/lib/model/fromDb";
import { computeClosedTrades } from "@/lib/model/metrics/trades";
import type { ClosedTrade } from "@/lib/model/types";

export type AccountTradesView = {
  account: Account;
  closedTrades: ClosedTrade[];
};

export interface LoadAccountTradesViewOpts {
  db?: Database.Database;
}

export async function loadAccountTradesView(
  uuid: string,
  opts: LoadAccountTradesViewOpts = {},
): Promise<AccountTradesView | null> {
  const db = opts.db ?? getDb();
  const account = getAccountByUuid(db, uuid);
  if (!account) return null;

  const rows = listTransactionsByAccount(db, account.id);
  const transactions = rows.map(transactionFromRow);
  const closedTrades = computeClosedTrades(transactions);

  return { account, closedTrades };
}
```

- [ ] **Step 4: Verify the test passes**

```bash
npm test -- tests/server/accountTrades.test.ts
```
Expected: 3 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/server/accountTrades.ts tests/server/accountTrades.test.ts
git commit -m "Add loadAccountTradesView loader

Returns closedTrades for an account by running its transactions
through the existing computeClosedTrades function. Returns null
for unknown UUIDs. Used by the new /accounts/[uuid]/trades page
in issue #5.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Wire `uuid` prop into `TransactionsPageClient`

The component currently calls `router.replace("/transactions[?qs]")` (hardcoded). For the per-account page it must write to `/accounts/${uuid}/transactions[?qs]` instead.

**Files:**
- Modify: `app/components/TransactionsPageClient.tsx`

- [ ] **Step 1: Add `uuid` to the props type and use it in the URL**

In `app/components/TransactionsPageClient.tsx`, change the props signature and the `updateQuery` callback. Replace this block:

```tsx
export function TransactionsPageClient({
  transactions,
}: {
  transactions: Transaction[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const { filter, sort } = useMemo(
    () => parseTransactionsQuery(new URLSearchParams(sp.toString())),
    [sp],
  );

  const updateQuery = useCallback(
    (nextFilter: TransactionsFilter, nextSort: TransactionsSort) => {
      const qs = serializeTransactionsQuery(nextFilter, nextSort).toString();
      router.replace(qs ? `/transactions?${qs}` : "/transactions");
    },
    [router],
  );
```

with:

```tsx
export function TransactionsPageClient({
  transactions,
  uuid,
}: {
  transactions: Transaction[];
  uuid: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const basePath = `/accounts/${uuid}/transactions`;

  const { filter, sort } = useMemo(
    () => parseTransactionsQuery(new URLSearchParams(sp.toString())),
    [sp],
  );

  const updateQuery = useCallback(
    (nextFilter: TransactionsFilter, nextSort: TransactionsSort) => {
      const qs = serializeTransactionsQuery(nextFilter, nextSort).toString();
      router.replace(qs ? `${basePath}?${qs}` : basePath);
    },
    [router, basePath],
  );
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/TransactionsPageClient.tsx
git commit -m "Take uuid prop in TransactionsPageClient for account-scoped URLs

The component was hardcoded to write filter state to /transactions.
Accepting uuid as a prop lets the new /accounts/[uuid]/transactions
page reuse the same filter UI without leaking the account out of
the URL. Component is otherwise unchanged.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Wire `uuid` prop into `TradesPageClient`

Same change as Task 4, for the trades client.

**Files:**
- Modify: `app/components/TradesPageClient.tsx`

- [ ] **Step 1: Add `uuid` prop and use it in the URL**

In `app/components/TradesPageClient.tsx`, replace this block:

```tsx
export function TradesPageClient({ trades }: { trades: ClosedTrade[] }) {
  const router = useRouter();
  const sp = useSearchParams();

  const { filter, sort } = useMemo(
    () => parseTradesQuery(new URLSearchParams(sp.toString())),
    [sp],
  );

  const updateQuery = useCallback(
    (nextFilter: TradesFilter, nextSort: TradesSort) => {
      const qs = serializeTradesQuery(nextFilter, nextSort).toString();
      router.replace(qs ? `/trades?${qs}` : "/trades");
    },
    [router],
  );
```

with:

```tsx
export function TradesPageClient({
  trades,
  uuid,
}: {
  trades: ClosedTrade[];
  uuid: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const basePath = `/accounts/${uuid}/trades`;

  const { filter, sort } = useMemo(
    () => parseTradesQuery(new URLSearchParams(sp.toString())),
    [sp],
  );

  const updateQuery = useCallback(
    (nextFilter: TradesFilter, nextSort: TradesSort) => {
      const qs = serializeTradesQuery(nextFilter, nextSort).toString();
      router.replace(qs ? `${basePath}?${qs}` : basePath);
    },
    [router, basePath],
  );
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/TradesPageClient.tsx
git commit -m "Take uuid prop in TradesPageClient for account-scoped URLs

Mirrors the change to TransactionsPageClient: filter state now
writes to /accounts/[uuid]/trades instead of the hardcoded /trades
path. Component otherwise unchanged.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: `/accounts/[uuid]/transactions` page

Server component that calls `loadAccountTransactionsView` and `getAccountTabFlags`, renders `AccountTabs` + a small page header + `TransactionsPageClient`. Returns 404 for unknown UUIDs (the layout already enforces this, but the loader is the authoritative check inside the page itself).

**Files:**
- Create: `app/accounts/[uuid]/transactions/page.tsx`

- [ ] **Step 1: Create the page**

`app/accounts/[uuid]/transactions/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { loadAccountTransactionsView } from "@/lib/server/accountTransactions";
import { getAccountTabFlags } from "@/lib/server/accountTabs";
import { AccountTabs } from "@/app/components/AccountTabs";
import { TransactionsPageClient } from "@/app/components/TransactionsPageClient";

export const dynamic = "force-dynamic";

export default async function AccountTransactionsPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const [data, flags] = await Promise.all([
    loadAccountTransactionsView(uuid),
    getAccountTabFlags(uuid),
  ]);

  if (data === null) notFound();

  const tabFlags = flags ?? { showOptions: true, showTrades: true };

  return (
    <>
      <AccountTabs uuid={uuid} flags={tabFlags} active="transactions" />
      <main className="min-h-screen p-6 max-w-7xl mx-auto">
        <header className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
          <div className="text-xl font-bold">
            {data.account.label} · Transactions
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {data.transactions.length} total
          </div>
        </header>
        <TransactionsPageClient transactions={data.transactions} uuid={uuid} />
      </main>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 4: Build (smoke)**

```bash
npm run build
```
Expected: build succeeds, route `/accounts/[uuid]/transactions` shown in route summary.

- [ ] **Step 5: Commit**

```bash
git add app/accounts/[uuid]/transactions/page.tsx
git commit -m "Add /accounts/[uuid]/transactions page

Server-rendered transaction log scoped to a single account. Reuses
TransactionsPageClient (with the new uuid prop) and the existing
in-page filter UI (date range, action type, ticker, search). Tabs
and 404 behavior match the existing /options and /overview pages.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: `/accounts/[uuid]/trades` page

Same pattern as Task 6, for the trades route.

**Files:**
- Create: `app/accounts/[uuid]/trades/page.tsx`

- [ ] **Step 1: Create the page**

`app/accounts/[uuid]/trades/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { loadAccountTradesView } from "@/lib/server/accountTrades";
import { getAccountTabFlags } from "@/lib/server/accountTabs";
import { AccountTabs } from "@/app/components/AccountTabs";
import { TradesPageClient } from "@/app/components/TradesPageClient";

export const dynamic = "force-dynamic";

export default async function AccountTradesPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const [data, flags] = await Promise.all([
    loadAccountTradesView(uuid),
    getAccountTabFlags(uuid),
  ]);

  if (data === null) notFound();

  const tabFlags = flags ?? { showOptions: true, showTrades: true };

  return (
    <>
      <AccountTabs uuid={uuid} flags={tabFlags} active="trades" />
      <main className="min-h-screen p-6 max-w-7xl mx-auto">
        <header className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-5 py-4 mb-4">
          <div className="text-xl font-bold">
            {data.account.label} · Trades
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {data.closedTrades.length} closed
          </div>
        </header>
        <TradesPageClient trades={data.closedTrades} uuid={uuid} />
      </main>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 4: Build (smoke)**

```bash
npm run build
```
Expected: build succeeds, route `/accounts/[uuid]/trades` shown in route summary.

- [ ] **Step 5: Commit**

```bash
git add app/accounts/[uuid]/trades/page.tsx
git commit -m "Add /accounts/[uuid]/trades page

Server-rendered closed-trades log scoped to a single account.
Reuses TradesPageClient (with the new uuid prop) and the existing
in-page filter UI (ticker, outcome, date range). Tabs and 404
behavior match the existing /options and /overview pages.

Closes #5

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Manual test pass + PR

**Files:** none (manual testing + PR creation).

- [ ] **Step 1: Full local test suite**

```bash
npm test
```
Expected: all suites pass.

- [ ] **Step 2: Run the dev server**

```bash
npm run dev
```
Expected: server boots on `http://localhost:3000`.

- [ ] **Step 3: Manual UI walkthrough**

Visit each URL with a real account UUID from `/`. Verify:

- [ ] `/accounts/<uuid>/transactions` renders the transaction log
- [ ] Action filter chips toggle and update the URL with `?actions=...`
- [ ] Ticker filter chips toggle and update the URL
- [ ] Date range and search inputs update the URL
- [ ] Sort by date / amount toggles direction
- [ ] Clear all resets URL to `/accounts/<uuid>/transactions`
- [ ] `/accounts/<uuid>/trades` renders the closed-trades table (empty if account has no options trades)
- [ ] Ticker and outcome filters work; date range and column sort work
- [ ] Tab nav from `/overview` → `/options` → `/trades` → `/transactions` works on all four
- [ ] Trades tab is hidden in the AccountTabs header for an account with `showTrades: false` (no eligible transactions)
- [ ] Visiting `/accounts/<bogus-uuid>/transactions` returns 404
- [ ] Visiting `/accounts/<bogus-uuid>/trades` returns 404

- [ ] **Step 4: Pre-commit hygiene check**

```bash
git status
git diff --cached
```
Expected: only files under `app/`, `lib/server/`, `tests/server/`, `docs/superpowers/plans/`. No CSV, XLSX, or files under `data/`/`transactions/`/`sheets/`.

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin fix/5-trades-and-transactions-pages
gh pr create --base multi-account --title "Add /accounts/[uuid]/trades and /accounts/[uuid]/transactions pages" --body "$(cat <<'EOF'
## Summary

Issue #5: relocates the legacy `/trades` and `/transactions` pages under per-account routes, fed by account-scoped data.

- New loaders: `lib/server/accountTransactions.ts`, `lib/server/accountTrades.ts` (each takes a UUID, returns the account + a list, or null for unknown UUID).
- New pages: `app/accounts/[uuid]/transactions/page.tsx`, `app/accounts/[uuid]/trades/page.tsx`. Render `AccountTabs` + a header + the existing client component.
- `TransactionsPageClient` and `TradesPageClient` now accept a `uuid` prop so URL-synced filter state writes back to the account-scoped path. Otherwise unchanged.
- No new global routes; the legacy `/trades` and `/transactions` were already removed in #1.

## Test plan

- [ ] `npm test` passes
- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm run build` succeeds
- [ ] `/accounts/<uuid>/transactions`: filters (action, ticker, date range, search), sort, clear-all
- [ ] `/accounts/<uuid>/trades`: filters (ticker, outcome, date range), sort, clear-all
- [ ] Tab nav: overview → options → trades → transactions (and back)
- [ ] Trades tab hidden when account has no eligible transactions
- [ ] Bogus UUID → 404 on both routes

Closes #5

*Co-authored by Claude*
EOF
)"
```

---

## Self-review checklist (already done while writing this plan)

- **Spec coverage:** All 6 acceptance criteria from issue #5 are covered.
  - `app/accounts/[uuid]/trades/page.tsx` → Task 7
  - `app/accounts/[uuid]/transactions/page.tsx` → Task 6
  - In-page filter UI survives → unchanged client components, exercised in Task 8 manual pass
  - Per-page tabs in `AppNav` → `AccountTabs` already declares the routes; pages render it (Tasks 6, 7)
  - Trades tab hidden when zero trades → already wired in `getAccountTabFlags`/`AccountTabs`; verified in Task 8
  - Old global routes deleted → already done in PR #17 (issue #1)
- **No placeholders:** every code block is the real thing.
- **Type consistency:** loader return types and prop signatures match across tasks. `uuid` is `string` in both client components.
