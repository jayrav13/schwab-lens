# Multi-Page Architecture + Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `/trades` and `/transactions` pages with URL-synced filters, a shared top nav, and trimmed dashboard previews — no new backend state.

**Architecture:** Pure filter/sort helpers live under `lib/model/filters/` and are fully unit-tested. Each new route is a thin server component that calls `loadDashboard({ includeMarketData: false })` and hands data to a client component that owns filter state and URL sync via `next/navigation`.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Tailwind 4, Vitest.

---

### Task 1: Pure `filterTrades` / `sortTrades` + URL helpers

**Files:**
- Create: `lib/model/filters/trades.ts`
- Test: `tests/model/filters/trades.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/model/filters/trades.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ClosedTrade } from "@/lib/model/metrics/trades";
import {
  filterTrades,
  sortTrades,
  parseTradesQuery,
  serializeTradesQuery,
  type TradesFilter,
  type TradesSort,
} from "@/lib/model/filters/trades";

function trade(
  ticker: string,
  closeDate: string,
  outcome: ClosedTrade["outcome"],
  netPnL: number,
  daysHeld = 7,
  openDate = "2026-01-15",
): ClosedTrade {
  return {
    contract: { ticker, expiry: closeDate, strike: 100, type: "Put" },
    openDate,
    openPrice: 1,
    closeDate,
    closePrice: 0,
    qty: 1,
    outcome,
    daysHeld,
    netPnL,
  };
}

const TRADES: ClosedTrade[] = [
  trade("AAPL", "2026-02-10", "ClosedProfit", 50, 5),
  trade("AAPL", "2026-03-10", "Assigned", -120, 30),
  trade("NVDA", "2026-03-15", "Expired", 25, 14),
  trade("SPY",  "2026-04-01", "ClosedLoss", -40, 3),
];

const EMPTY: TradesFilter = { tickers: new Set(), outcomes: new Set() };
const DEFAULT_SORT: TradesSort = { key: "closeDate", dir: "desc" };

describe("filterTrades", () => {
  it("returns all trades when filter is empty", () => {
    expect(filterTrades(TRADES, EMPTY)).toHaveLength(4);
  });

  it("filters by ticker set", () => {
    const res = filterTrades(TRADES, { ...EMPTY, tickers: new Set(["AAPL"]) });
    expect(res.map((t) => t.contract.ticker)).toEqual(["AAPL", "AAPL"]);
  });

  it("filters by outcome set", () => {
    const res = filterTrades(TRADES, {
      ...EMPTY,
      outcomes: new Set(["Expired", "Assigned"]),
    });
    expect(res.map((t) => t.outcome).sort()).toEqual(["Assigned", "Expired"]);
  });

  it("filters by from/to date range inclusively on closeDate", () => {
    const res = filterTrades(TRADES, {
      ...EMPTY,
      from: "2026-03-10",
      to: "2026-03-15",
    });
    expect(res.map((t) => t.closeDate)).toEqual(["2026-03-10", "2026-03-15"]);
  });

  it("combines all axes with AND", () => {
    const res = filterTrades(TRADES, {
      tickers: new Set(["AAPL"]),
      outcomes: new Set(["ClosedProfit"]),
      from: "2026-01-15",
      to: "2026-12-31",
    });
    expect(res).toHaveLength(1);
    expect(res[0].closeDate).toBe("2026-02-10");
  });
});

describe("sortTrades", () => {
  it("sorts by closeDate desc by default, tie-breaks by openDate asc", () => {
    const a = trade("X", "2026-04-01", "Expired", 1, 1, "2026-01-15");
    const b = trade("X", "2026-04-01", "Expired", 1, 1, "2026-02-01");
    const res = sortTrades([b, a], DEFAULT_SORT);
    expect(res.map((t) => t.openDate)).toEqual(["2026-01-15", "2026-02-01"]);
  });

  it("sorts by closeDate asc", () => {
    const res = sortTrades(TRADES, { key: "closeDate", dir: "asc" });
    expect(res.map((t) => t.closeDate)).toEqual([
      "2026-02-10",
      "2026-03-10",
      "2026-03-15",
      "2026-04-01",
    ]);
  });

  it("sorts by daysHeld asc", () => {
    const res = sortTrades(TRADES, { key: "daysHeld", dir: "asc" });
    expect(res.map((t) => t.daysHeld)).toEqual([3, 5, 14, 30]);
  });

  it("sorts by netPnL desc", () => {
    const res = sortTrades(TRADES, { key: "netPnL", dir: "desc" });
    expect(res.map((t) => t.netPnL)).toEqual([50, 25, -40, -120]);
  });
});

describe("parseTradesQuery", () => {
  it("returns empty filter and default sort when params are absent", () => {
    const { filter, sort } = parseTradesQuery(new URLSearchParams(""));
    expect(filter).toEqual({ tickers: new Set(), outcomes: new Set() });
    expect(sort).toEqual({ key: "closeDate", dir: "desc" });
  });

  it("parses all params", () => {
    const sp = new URLSearchParams(
      "ticker=AAPL,NVDA&outcome=Expired,Assigned&from=2026-01-15&to=2026-04-23&sort=netPnL:asc",
    );
    const { filter, sort } = parseTradesQuery(sp);
    expect(filter.tickers).toEqual(new Set(["AAPL", "NVDA"]));
    expect(filter.outcomes).toEqual(new Set(["Expired", "Assigned"]));
    expect(filter.from).toBe("2026-01-15");
    expect(filter.to).toBe("2026-04-23");
    expect(sort).toEqual({ key: "netPnL", dir: "asc" });
  });

  it("ignores malformed outcomes, dates, and sort", () => {
    const sp = new URLSearchParams(
      "outcome=Foo,Expired&from=notadate&sort=bogus:weird",
    );
    const { filter, sort } = parseTradesQuery(sp);
    expect(filter.outcomes).toEqual(new Set(["Expired"]));
    expect(filter.from).toBeUndefined();
    expect(sort).toEqual({ key: "closeDate", dir: "desc" });
  });
});

describe("serializeTradesQuery", () => {
  it("omits default sort and empty filters", () => {
    const qs = serializeTradesQuery(EMPTY, DEFAULT_SORT).toString();
    expect(qs).toBe("");
  });

  it("serializes non-default values", () => {
    const qs = serializeTradesQuery(
      {
        tickers: new Set(["AAPL", "NVDA"]),
        outcomes: new Set(["Expired"]),
        from: "2026-01-15",
      },
      { key: "netPnL", dir: "asc" },
    );
    const s = qs.toString();
    expect(s).toContain("ticker=AAPL%2CNVDA");
    expect(s).toContain("outcome=Expired");
    expect(s).toContain("from=2026-01-15");
    expect(s).toContain("sort=netPnL%3Aasc");
    expect(s).not.toContain("to=");
  });

  it("round-trips through parse", () => {
    const f: TradesFilter = {
      tickers: new Set(["AAPL"]),
      outcomes: new Set(["Assigned", "Expired"]),
      from: "2026-01-15",
      to: "2026-04-23",
    };
    const s: TradesSort = { key: "daysHeld", dir: "asc" };
    const qs = serializeTradesQuery(f, s);
    const back = parseTradesQuery(qs);
    expect(back.filter.tickers).toEqual(f.tickers);
    expect(back.filter.outcomes).toEqual(f.outcomes);
    expect(back.filter.from).toBe(f.from);
    expect(back.filter.to).toBe(f.to);
    expect(back.sort).toEqual(s);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/model/filters/trades.test.ts`
Expected: FAIL with "Failed to resolve import '@/lib/model/filters/trades'".

- [ ] **Step 3: Write the implementation**

Create `lib/model/filters/trades.ts`:

```ts
import type { ClosedTrade, TradeOutcome } from "@/lib/model/metrics/trades";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALL_OUTCOMES: ReadonlySet<TradeOutcome> = new Set([
  "Expired",
  "Assigned",
  "ClosedProfit",
  "ClosedLoss",
]);

export type TradesFilter = {
  tickers: Set<string>;
  outcomes: Set<TradeOutcome>;
  from?: string;
  to?: string;
};

export type TradesSortKey = "closeDate" | "daysHeld" | "netPnL";
export type SortDir = "asc" | "desc";
export type TradesSort = { key: TradesSortKey; dir: SortDir };

const DEFAULT_SORT: TradesSort = { key: "closeDate", dir: "desc" };

export function filterTrades(
  trades: ClosedTrade[],
  f: TradesFilter,
): ClosedTrade[] {
  return trades.filter((t) => {
    if (f.tickers.size > 0 && !f.tickers.has(t.contract.ticker)) return false;
    if (f.outcomes.size > 0 && !f.outcomes.has(t.outcome)) return false;
    if (f.from != null && t.closeDate < f.from) return false;
    if (f.to != null && t.closeDate > f.to) return false;
    return true;
  });
}

export function sortTrades(
  trades: ClosedTrade[],
  s: TradesSort,
): ClosedTrade[] {
  const sign = s.dir === "asc" ? 1 : -1;
  return [...trades].sort((a, b) => {
    let diff = 0;
    if (s.key === "closeDate") {
      diff = a.closeDate < b.closeDate ? -1 : a.closeDate > b.closeDate ? 1 : 0;
    } else if (s.key === "daysHeld") {
      diff = a.daysHeld - b.daysHeld;
    } else {
      diff = a.netPnL - b.netPnL;
    }
    if (diff !== 0) return sign * diff;
    // tie-break: openDate asc (oldest-opened first), regardless of dir
    return a.openDate < b.openDate ? -1 : a.openDate > b.openDate ? 1 : 0;
  });
}

export function parseTradesQuery(sp: URLSearchParams): {
  filter: TradesFilter;
  sort: TradesSort;
} {
  const tickers = new Set(
    (sp.get("ticker") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  const outcomes = new Set<TradeOutcome>(
    (sp.get("outcome") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is TradeOutcome => ALL_OUTCOMES.has(s as TradeOutcome)),
  );
  const fromRaw = sp.get("from") ?? undefined;
  const toRaw = sp.get("to") ?? undefined;
  const from = fromRaw && ISO_DATE.test(fromRaw) ? fromRaw : undefined;
  const to = toRaw && ISO_DATE.test(toRaw) ? toRaw : undefined;

  const sortRaw = sp.get("sort") ?? "";
  const [rawKey, rawDir] = sortRaw.split(":");
  const validKey: TradesSortKey | null =
    rawKey === "closeDate" || rawKey === "daysHeld" || rawKey === "netPnL"
      ? rawKey
      : null;
  const validDir: SortDir | null =
    rawDir === "asc" || rawDir === "desc" ? rawDir : null;
  const sort: TradesSort =
    validKey && validDir ? { key: validKey, dir: validDir } : DEFAULT_SORT;

  return { filter: { tickers, outcomes, from, to }, sort };
}

export function serializeTradesQuery(
  f: TradesFilter,
  s: TradesSort,
): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.tickers.size > 0) {
    sp.set("ticker", Array.from(f.tickers).sort().join(","));
  }
  if (f.outcomes.size > 0) {
    sp.set("outcome", Array.from(f.outcomes).sort().join(","));
  }
  if (f.from) sp.set("from", f.from);
  if (f.to) sp.set("to", f.to);
  if (s.key !== DEFAULT_SORT.key || s.dir !== DEFAULT_SORT.dir) {
    sp.set("sort", `${s.key}:${s.dir}`);
  }
  return sp;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/model/filters/trades.test.ts`
Expected: PASS, all assertions green.

- [ ] **Step 5: Run the full suite to confirm nothing broke**

Run: `npx vitest run`
Expected: full suite passes (149 existing + new filter tests).

- [ ] **Step 6: Commit**

```bash
git status
git diff --cached  # verify no CSVs
git add lib/model/filters/trades.ts tests/model/filters/trades.test.ts
git commit -m "$(cat <<'EOF'
Add pure trades filter/sort + URL query helpers

filterTrades/sortTrades plus parseTradesQuery/serializeTradesQuery for
/trades-page URL syncing. Ignores malformed outcomes/dates/sort keys.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Pure `filterTransactions` / `sortTransactions` + URL helpers

**Files:**
- Create: `lib/model/filters/transactions.ts`
- Test: `tests/model/filters/transactions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/model/filters/transactions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Transaction, Action, RawCsvRow } from "@/lib/csv/types";
import {
  filterTransactions,
  sortTransactions,
  parseTransactionsQuery,
  serializeTransactionsQuery,
  type TransactionsFilter,
  type TransactionsSort,
} from "@/lib/model/filters/transactions";

const EMPTY_RAW: RawCsvRow = {
  Date: "",
  Action: "",
  Symbol: "",
  Description: "",
  Quantity: "",
  Price: "",
  "Fees & Comm": "",
  Amount: "",
};

function tx(
  tradeDate: string,
  action: Action,
  ticker: string | undefined,
  amount: number,
  description = "",
): Transaction {
  return {
    tradeDate,
    action,
    ticker,
    quantity: 0,
    fees: 0,
    amount,
    raw: { ...EMPTY_RAW, Date: tradeDate, Action: action, Description: description },
    rawAction: action,
  };
}

const TXS: Transaction[] = [
  tx("2026-01-10", "SellToOpen", "AAPL", 120, "sold calls"),
  tx("2026-02-15", "BuyToClose", "AAPL", -40, "bought back"),
  tx("2026-03-01", "QualifiedDividend", "NVDA", 2.5, "ORD DIVIDEND"),
  tx("2026-03-20", "BankInterest", undefined, 0.25, "CREDIT INTEREST"),
];

const EMPTY: TransactionsFilter = {
  actions: new Set(),
  tickers: new Set(),
  q: "",
};
const DEFAULT_SORT: TransactionsSort = { key: "tradeDate", dir: "desc" };

describe("filterTransactions", () => {
  it("returns all when filter is empty", () => {
    expect(filterTransactions(TXS, EMPTY)).toHaveLength(4);
  });

  it("filters by action set", () => {
    const res = filterTransactions(TXS, {
      ...EMPTY,
      actions: new Set(["SellToOpen", "BuyToClose"]),
    });
    expect(res).toHaveLength(2);
  });

  it("filters by ticker set (missing ticker excluded when set is non-empty)", () => {
    const res = filterTransactions(TXS, { ...EMPTY, tickers: new Set(["NVDA"]) });
    expect(res.map((t) => t.ticker)).toEqual(["NVDA"]);
  });

  it("filters by from/to range on tradeDate inclusively", () => {
    const res = filterTransactions(TXS, {
      ...EMPTY,
      from: "2026-02-01",
      to: "2026-03-10",
    });
    expect(res.map((t) => t.tradeDate)).toEqual(["2026-02-15", "2026-03-01"]);
  });

  it("searches ticker + description case-insensitively", () => {
    const res = filterTransactions(TXS, { ...EMPTY, q: "INTEREST" });
    expect(res).toHaveLength(1);
    expect(res[0].action).toBe("BankInterest");
  });

  it("combines all axes with AND", () => {
    const res = filterTransactions(TXS, {
      actions: new Set(["QualifiedDividend", "BankInterest"]),
      tickers: new Set(),
      from: "2026-03-01",
      to: "2026-03-31",
      q: "dividend",
    });
    expect(res).toHaveLength(1);
    expect(res[0].ticker).toBe("NVDA");
  });
});

describe("sortTransactions", () => {
  it("sorts by tradeDate desc by default", () => {
    const res = sortTransactions(TXS, DEFAULT_SORT);
    expect(res.map((t) => t.tradeDate)).toEqual([
      "2026-03-20",
      "2026-03-01",
      "2026-02-15",
      "2026-01-10",
    ]);
  });

  it("sorts by amount asc", () => {
    const res = sortTransactions(TXS, { key: "amount", dir: "asc" });
    expect(res.map((t) => t.amount)).toEqual([-40, 0.25, 2.5, 120]);
  });
});

describe("parseTransactionsQuery / serializeTransactionsQuery", () => {
  it("defaults to empty filter + default sort", () => {
    const { filter, sort } = parseTransactionsQuery(new URLSearchParams(""));
    expect(filter).toEqual({ actions: new Set(), tickers: new Set(), q: "" });
    expect(sort).toEqual(DEFAULT_SORT);
  });

  it("parses all params and ignores unknown actions", () => {
    const sp = new URLSearchParams(
      "action=SellToOpen,BogusAction,BuyToClose&ticker=AAPL&from=2026-01-15&to=2026-04-23&q=dividend&sort=amount:asc",
    );
    const { filter, sort } = parseTransactionsQuery(sp);
    expect(filter.actions).toEqual(new Set(["SellToOpen", "BuyToClose"]));
    expect(filter.tickers).toEqual(new Set(["AAPL"]));
    expect(filter.from).toBe("2026-01-15");
    expect(filter.to).toBe("2026-04-23");
    expect(filter.q).toBe("dividend");
    expect(sort).toEqual({ key: "amount", dir: "asc" });
  });

  it("round-trips", () => {
    const f: TransactionsFilter = {
      actions: new Set(["SellToOpen"]),
      tickers: new Set(["AAPL", "NVDA"]),
      from: "2026-01-15",
      to: "2026-04-23",
      q: "hello",
    };
    const s: TransactionsSort = { key: "tradeDate", dir: "asc" };
    const back = parseTransactionsQuery(serializeTransactionsQuery(f, s));
    expect(back.filter.actions).toEqual(f.actions);
    expect(back.filter.tickers).toEqual(f.tickers);
    expect(back.filter.from).toBe(f.from);
    expect(back.filter.to).toBe(f.to);
    expect(back.filter.q).toBe(f.q);
    expect(back.sort).toEqual(s);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/model/filters/transactions.test.ts`
Expected: FAIL (module resolution error).

- [ ] **Step 3: Write the implementation**

Create `lib/model/filters/transactions.ts`:

```ts
import type { Action, Transaction } from "@/lib/csv/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ALL_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "SellToOpen",
  "BuyToClose",
  "Expired",
  "Assigned",
  "Buy",
  "Sell",
  "QualifiedDividend",
  "BankInterest",
  "CreditInterest",
  "Journal",
  "WireSent",
  "MiscCashEntry",
  "ServiceFee",
  "Unknown",
]);

export type TransactionsFilter = {
  actions: Set<Action>;
  tickers: Set<string>;
  from?: string;
  to?: string;
  q: string;
};

export type TransactionsSortKey = "tradeDate" | "amount";
export type SortDir = "asc" | "desc";
export type TransactionsSort = { key: TransactionsSortKey; dir: SortDir };

const DEFAULT_SORT: TransactionsSort = { key: "tradeDate", dir: "desc" };

export function filterTransactions(
  transactions: Transaction[],
  f: TransactionsFilter,
): Transaction[] {
  const q = f.q.trim().toLowerCase();
  return transactions.filter((t) => {
    if (f.actions.size > 0 && !f.actions.has(t.action)) return false;
    if (f.tickers.size > 0) {
      if (!t.ticker || !f.tickers.has(t.ticker)) return false;
    }
    if (f.from != null && t.tradeDate < f.from) return false;
    if (f.to != null && t.tradeDate > f.to) return false;
    if (q.length > 0) {
      const hay = `${t.ticker ?? ""} ${t.raw.Description ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortTransactions(
  transactions: Transaction[],
  s: TransactionsSort,
): Transaction[] {
  const sign = s.dir === "asc" ? 1 : -1;
  return [...transactions].sort((a, b) => {
    let diff = 0;
    if (s.key === "tradeDate") {
      diff = a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0;
    } else {
      diff = a.amount - b.amount;
    }
    return sign * diff;
  });
}

export function parseTransactionsQuery(sp: URLSearchParams): {
  filter: TransactionsFilter;
  sort: TransactionsSort;
} {
  const actions = new Set<Action>(
    (sp.get("action") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is Action => ALL_ACTIONS.has(s as Action)),
  );
  const tickers = new Set(
    (sp.get("ticker") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  const fromRaw = sp.get("from") ?? undefined;
  const toRaw = sp.get("to") ?? undefined;
  const from = fromRaw && ISO_DATE.test(fromRaw) ? fromRaw : undefined;
  const to = toRaw && ISO_DATE.test(toRaw) ? toRaw : undefined;
  const q = sp.get("q") ?? "";

  const sortRaw = sp.get("sort") ?? "";
  const [rawKey, rawDir] = sortRaw.split(":");
  const validKey: TransactionsSortKey | null =
    rawKey === "tradeDate" || rawKey === "amount" ? rawKey : null;
  const validDir: SortDir | null =
    rawDir === "asc" || rawDir === "desc" ? rawDir : null;
  const sort: TransactionsSort =
    validKey && validDir ? { key: validKey, dir: validDir } : DEFAULT_SORT;

  return { filter: { actions, tickers, from, to, q }, sort };
}

export function serializeTransactionsQuery(
  f: TransactionsFilter,
  s: TransactionsSort,
): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.actions.size > 0) {
    sp.set("action", Array.from(f.actions).sort().join(","));
  }
  if (f.tickers.size > 0) {
    sp.set("ticker", Array.from(f.tickers).sort().join(","));
  }
  if (f.from) sp.set("from", f.from);
  if (f.to) sp.set("to", f.to);
  if (f.q.trim().length > 0) sp.set("q", f.q);
  if (s.key !== DEFAULT_SORT.key || s.dir !== DEFAULT_SORT.dir) {
    sp.set("sort", `${s.key}:${s.dir}`);
  }
  return sp;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/model/filters/transactions.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git status
git diff --cached
git add lib/model/filters/transactions.ts tests/model/filters/transactions.test.ts
git commit -m "$(cat <<'EOF'
Add pure transactions filter/sort + URL query helpers

filterTransactions/sortTransactions with action, ticker, date range,
and free-text filters. parseTransactionsQuery/serializeTransactionsQuery
handle URL sync with unknown-action rejection.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `loadDashboard` accepts `{ includeMarketData }` option

**Files:**
- Modify: `lib/server/dashboard.ts`
- Test: `tests/integration.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/integration.test.ts` (after the existing `describe("loadDashboard", ...)` block):

```ts
describe("loadDashboard({ includeMarketData: false })", () => {
  it("skips historical + benchmark + mark-to-market entirely", async () => {
    const result = await loadDashboard({ includeMarketData: false });
    if (result.kind !== "ready") return;

    expect(result.state.portfolioValueSeries).toBeUndefined();
    expect(result.state.benchmarkSeries).toBeUndefined();
    expect(result.state.benchmarkTicker).toBeUndefined();
    expect(result.markToMarket).toBeNull();

    const missing = result.state.warnings.filter(
      (w) => w.kind === "MissingHistoricalPrices",
    );
    expect(missing).toEqual([]);
  });

  it("still returns closedTrades and transactions", async () => {
    const result = await loadDashboard({ includeMarketData: false });
    if (result.kind !== "ready") return;
    expect(Array.isArray(result.state.closedTrades)).toBe(true);
    expect(Array.isArray(result.state.transactions)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration.test.ts`
Expected: FAIL with TypeScript error — `loadDashboard` takes no arguments.

- [ ] **Step 3: Update `loadDashboard` with four targeted edits**

Make these four edits to `lib/server/dashboard.ts`. Every other line stays as-is — do not rewrite the whole file.

**Edit 3a:** Add the options type above the existing `export async function loadDashboard(...)` declaration. Currently the signature is:

```ts
export async function loadDashboard(): Promise<DashboardData> {
  const dataDir = path.join(process.cwd(), "data");
```

Change it to:

```ts
export type LoadDashboardOptions = {
  includeMarketData?: boolean;
};

export async function loadDashboard(
  options: LoadDashboardOptions = {},
): Promise<DashboardData> {
  const includeMarketData = options.includeMarketData ?? true;
  const dataDir = path.join(process.cwd(), "data");
```

**Edit 3b:** Gate the historical/benchmark block. Currently:

```ts
    if (config.marketData.enabled) {
      const heldTickers = collectHeldTickers(state, seed);
```

Change to:

```ts
    if (includeMarketData && config.marketData.enabled) {
      const heldTickers = collectHeldTickers(state, seed);
```

**Edit 3c:** Gate the mark-to-market block. Currently:

```ts
    let markToMarket: MarkToMarket | null = null;
    if (
      config.marketData.enabled &&
      (state.openSharePositions.length > 0 || latestSnap !== null)
    ) {
```

Change to:

```ts
    let markToMarket: MarkToMarket | null = null;
    if (
      includeMarketData &&
      config.marketData.enabled &&
      (state.openSharePositions.length > 0 || latestSnap !== null)
    ) {
```

**Edit 3d:** In the final `return { kind: "ready", ... }`, change:

```ts
      latestSnapshot: latestSnap,
```

to:

```ts
      latestSnapshot: includeMarketData ? latestSnap : null,
```

This keeps snapshot state off the pages that don't render it.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/integration.test.ts`
Expected: PASS (both new tests plus existing ones).

- [ ] **Step 5: Run full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git status
git diff --cached
git add lib/server/dashboard.ts tests/integration.test.ts
git commit -m "$(cat <<'EOF'
loadDashboard: skip market data work when includeMarketData=false

/trades and /transactions pages don't need historical closes,
benchmark, or mark-to-market — this option lets them avoid the
per-request API/IO cost.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Shared top nav + wire into root layout

**Files:**
- Create: `app/components/AppNav.tsx`
- Modify: `app/layout.tsx`

No unit tests — this is visual wiring. We'll smoke-test in Task 7.

- [ ] **Step 1: Create `AppNav`**

Create `app/components/AppNav.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: Array<{ href: string; label: string }> = [
  { href: "/", label: "Dashboard" },
  { href: "/trades", label: "Trades" },
  { href: "/transactions", label: "Transactions" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
        <span className="font-bold text-gray-900 dark:text-gray-100">Demo</span>
        <div className="flex items-center gap-4">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm ${
                  active
                    ? "font-semibold text-gray-900 dark:text-gray-100"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Wire into `app/layout.tsx`**

Replace the contents of `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { AppNav } from "@/app/components/AppNav";

export const metadata: Metadata = {
  title: "Demo",
  description: "Options income tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AppNav />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git status
git diff --cached
git add app/components/AppNav.tsx app/layout.tsx
git commit -m "$(cat <<'EOF'
Add shared AppNav bar in root layout

Dashboard / Trades / Transactions links with active-path highlight,
rendered above every page.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `/trades` page + shrink dashboard preview card

**Files:**
- Create: `app/trades/page.tsx`
- Create: `app/components/TradesPageClient.tsx`
- Modify: `app/components/TradeHistoryCard.tsx`

- [ ] **Step 1: Create `/trades` server route**

Create `app/trades/page.tsx`:

```tsx
import { loadDashboard } from "@/lib/server/dashboard";
import { TradesPageClient } from "@/app/components/TradesPageClient";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const data = await loadDashboard({ includeMarketData: false });

  if (data.kind === "no-csv" || data.kind === "no-config") {
    return (
      <main className="p-6 max-w-7xl mx-auto">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No data loaded. Head back to the{" "}
          <a href="/" className="underline">dashboard</a> to get started.
        </p>
      </main>
    );
  }
  if (data.kind === "parse-error") {
    return (
      <main className="p-6 max-w-7xl mx-auto">
        <pre className="bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 text-xs p-3 rounded overflow-x-auto">
          {data.message}
        </pre>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-7xl mx-auto">
      <TradesPageClient trades={data.state.closedTrades ?? []} />
    </main>
  );
}
```

- [ ] **Step 2: Create `TradesPageClient`**

Create `app/components/TradesPageClient.tsx`:

```tsx
"use client";
import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ClosedTrade, TradeOutcome } from "@/lib/model/types";
import {
  filterTrades,
  sortTrades,
  parseTradesQuery,
  serializeTradesQuery,
  type TradesFilter,
  type TradesSort,
  type TradesSortKey,
} from "@/lib/model/filters/trades";
import { formatCurrency } from "@/lib/util/money";

const ALL_OUTCOMES: TradeOutcome[] = [
  "Expired",
  "Assigned",
  "ClosedProfit",
  "ClosedLoss",
];

const OUTCOME_LABEL: Record<TradeOutcome, string> = {
  Expired: "Expired",
  Assigned: "Assigned",
  ClosedProfit: "Profit",
  ClosedLoss: "Loss",
};

function outcomeBadgeClasses(outcome: TradeOutcome): string {
  if (outcome === "ClosedLoss") {
    return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300";
  }
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
}

function formatContract(c: ClosedTrade["contract"]): string {
  return `${c.ticker} $${c.strike.toFixed(2)} ${c.type[0]}`;
}

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

  const allTickers = useMemo(
    () => Array.from(new Set(trades.map((t) => t.contract.ticker))).sort(),
    [trades],
  );

  const filtered = useMemo(
    () => sortTrades(filterTrades(trades, filter), sort),
    [trades, filter, sort],
  );

  const netPnL = filtered.reduce((a, t) => a + t.netPnL, 0);

  const toggleTicker = (ticker: string) => {
    const next = new Set(filter.tickers);
    if (next.has(ticker)) next.delete(ticker);
    else next.add(ticker);
    updateQuery({ ...filter, tickers: next }, sort);
  };
  const toggleOutcome = (o: TradeOutcome) => {
    const next = new Set(filter.outcomes);
    if (next.has(o)) next.delete(o);
    else next.add(o);
    updateQuery({ ...filter, outcomes: next }, sort);
  };
  const setFrom = (v: string) =>
    updateQuery({ ...filter, from: v || undefined }, sort);
  const setTo = (v: string) =>
    updateQuery({ ...filter, to: v || undefined }, sort);
  const setSort = (key: TradesSortKey) => {
    const nextDir =
      sort.key === key ? (sort.dir === "asc" ? "desc" : "asc") : "desc";
    updateQuery(filter, { key, dir: nextDir });
  };
  const clearAll = () =>
    updateQuery(
      { tickers: new Set(), outcomes: new Set() },
      { key: "closeDate", dir: "desc" },
    );

  const hasFilter =
    filter.tickers.size > 0 ||
    filter.outcomes.size > 0 ||
    filter.from != null ||
    filter.to != null;

  const arrow = (key: TradesSortKey) =>
    sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
          Closed trades
        </h3>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} matching · net{" "}
          <span
            className={
              netPnL >= 0
                ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                : "text-rose-700 dark:text-rose-400 font-semibold"
            }
          >
            {netPnL >= 0 ? "+" : "−"}
            {formatCurrency(Math.abs(netPnL))}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
            Ticker
          </div>
          <div className="flex flex-wrap gap-1">
            {allTickers.map((t) => {
              const on = filter.tickers.has(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTicker(t)}
                  className={`px-2 py-0.5 rounded border text-[11px] ${
                    on
                      ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
                      : "bg-white dark:bg-neutral-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-neutral-700"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
            Outcome
          </div>
          <div className="flex flex-wrap gap-1">
            {ALL_OUTCOMES.map((o) => {
              const on = filter.outcomes.has(o);
              return (
                <button
                  key={o}
                  onClick={() => toggleOutcome(o)}
                  className={`px-2 py-0.5 rounded border text-[11px] ${
                    on
                      ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
                      : "bg-white dark:bg-neutral-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-neutral-700"
                  }`}
                >
                  {OUTCOME_LABEL[o]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-2 items-end">
          <label className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
              From (close date)
            </div>
            <input
              type="date"
              value={filter.from ?? ""}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
              To
            </div>
            <input
              type="date"
              value={filter.to ?? ""}
              onChange={(e) => setTo(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100"
            />
          </label>
        </div>
        <div className="flex items-end">
          {hasFilter && (
            <button
              onClick={clearAll}
              className="text-[11px] px-2 py-1 border border-gray-300 dark:border-neutral-700 rounded hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-gray-300"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-4">
          No trades match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-neutral-800">
                <th className="py-1.5 pr-3">Contract</th>
                <th className="py-1.5 pr-3">Opened</th>
                <th
                  className="py-1.5 pr-3 cursor-pointer select-none"
                  onClick={() => setSort("closeDate")}
                >
                  Closed{arrow("closeDate")}
                </th>
                <th className="py-1.5 pr-3 text-right">Qty</th>
                <th
                  className="py-1.5 pr-3 text-right cursor-pointer select-none"
                  onClick={() => setSort("daysHeld")}
                >
                  Held{arrow("daysHeld")}
                </th>
                <th className="py-1.5 pr-3">Outcome</th>
                <th
                  className="py-1.5 text-right cursor-pointer select-none"
                  onClick={() => setSort("netPnL")}
                >
                  P&amp;L{arrow("netPnL")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-100 dark:border-neutral-800 last:border-0"
                >
                  <td className="py-1.5 pr-3">
                    <div className="font-semibold">{formatContract(t.contract)}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      exp {t.contract.expiry.slice(5)}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3">
                    <div>{t.openDate.slice(5)}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      ${t.openPrice.toFixed(2)}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3">
                    <div>{t.closeDate.slice(5)}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      {t.outcome === "Expired" || t.outcome === "Assigned"
                        ? "—"
                        : `$${t.closePrice.toFixed(2)}`}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 text-right">{t.qty}</td>
                  <td className="py-1.5 pr-3 text-right">{t.daysHeld}d</td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${outcomeBadgeClasses(t.outcome)}`}
                    >
                      {OUTCOME_LABEL[t.outcome]}
                    </span>
                  </td>
                  <td
                    className={`py-1.5 text-right font-semibold ${t.netPnL >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
                  >
                    {t.netPnL >= 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(t.netPnL))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Shrink the dashboard `TradeHistoryCard` to a preview**

Replace `app/components/TradeHistoryCard.tsx` with:

```tsx
import Link from "next/link";
import type {
  ClosedTrade,
  PortfolioState,
  TradeOutcome,
} from "@/lib/model/types";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState };

const PREVIEW_COUNT = 5;

const OUTCOME_LABEL: Record<TradeOutcome, string> = {
  Expired: "Expired",
  Assigned: "Assigned",
  ClosedProfit: "Profit",
  ClosedLoss: "Loss",
};

function outcomeBadgeClasses(outcome: TradeOutcome): string {
  if (outcome === "ClosedLoss") {
    return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300";
  }
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
}

function formatContract(c: ClosedTrade["contract"]): string {
  return `${c.ticker} $${c.strike.toFixed(2)} ${c.type[0]}`;
}

function sortedDesc(trades: ClosedTrade[]): ClosedTrade[] {
  return [...trades].sort((a, b) => {
    if (a.closeDate !== b.closeDate) return a.closeDate < b.closeDate ? 1 : -1;
    if (a.openDate !== b.openDate) return a.openDate < b.openDate ? -1 : 1;
    return 0;
  });
}

export function TradeHistoryCard({ state }: Props) {
  const all = sortedDesc(state.closedTrades ?? []);
  const preview = all.slice(0, PREVIEW_COUNT);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-baseline justify-between mb-0.5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
          Closed trades
        </h3>
        {all.length > 0 && (
          <Link
            href="/trades"
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            View all {all.length} →
          </Link>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Most recent {preview.length} of {all.length}.
      </p>
      {preview.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
          No closed trades yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-neutral-800">
                <th className="py-1.5 pr-3">Contract</th>
                <th className="py-1.5 pr-3">Closed</th>
                <th className="py-1.5 pr-3">Outcome</th>
                <th className="py-1.5 text-right">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((t, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-100 dark:border-neutral-800 last:border-0"
                >
                  <td className="py-1.5 pr-3 font-semibold">
                    {formatContract(t.contract)}
                  </td>
                  <td className="py-1.5 pr-3">{t.closeDate.slice(5)}</td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${outcomeBadgeClasses(t.outcome)}`}
                    >
                      {OUTCOME_LABEL[t.outcome]}
                    </span>
                  </td>
                  <td
                    className={`py-1.5 text-right font-semibold ${t.netPnL >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
                  >
                    {t.netPnL >= 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(t.netPnL))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git status
git diff --cached
git add app/trades/ app/components/TradesPageClient.tsx app/components/TradeHistoryCard.tsx
git commit -m "$(cat <<'EOF'
Add /trades page with URL-synced filters + shrink dashboard card

/trades renders ticker/outcome/date-range filter chips, sortable
columns, and a filtered count + net P&L summary. Dashboard's
TradeHistoryCard becomes a 5-row preview with a "View all N →" link.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `/transactions` page + shrink dashboard preview card

**Files:**
- Create: `app/transactions/page.tsx`
- Create: `app/components/TransactionsPageClient.tsx`
- Modify: `app/components/TransactionLogCard.tsx`

- [ ] **Step 1: Create `/transactions` server route**

Create `app/transactions/page.tsx`:

```tsx
import { loadDashboard } from "@/lib/server/dashboard";
import { TransactionsPageClient } from "@/app/components/TransactionsPageClient";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const data = await loadDashboard({ includeMarketData: false });

  if (data.kind === "no-csv" || data.kind === "no-config") {
    return (
      <main className="p-6 max-w-7xl mx-auto">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No data loaded. Head back to the{" "}
          <a href="/" className="underline">dashboard</a> to get started.
        </p>
      </main>
    );
  }
  if (data.kind === "parse-error") {
    return (
      <main className="p-6 max-w-7xl mx-auto">
        <pre className="bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 text-xs p-3 rounded overflow-x-auto">
          {data.message}
        </pre>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-7xl mx-auto">
      <TransactionsPageClient transactions={data.state.transactions} />
    </main>
  );
}
```

- [ ] **Step 2: Create `TransactionsPageClient`**

Create `app/components/TransactionsPageClient.tsx`:

```tsx
"use client";
import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Action, Transaction } from "@/lib/csv/types";
import {
  filterTransactions,
  sortTransactions,
  parseTransactionsQuery,
  serializeTransactionsQuery,
  type TransactionsFilter,
  type TransactionsSort,
  type TransactionsSortKey,
} from "@/lib/model/filters/transactions";
import { formatCurrency } from "@/lib/util/money";

const ACTION_LABEL: Record<string, string> = {
  SellToOpen: "STO",
  BuyToClose: "BTC",
  Expired: "EXP",
  Assigned: "ASN",
  Buy: "BUY",
  Sell: "SELL",
  QualifiedDividend: "DIV",
  BankInterest: "INT",
  CreditInterest: "INT",
  Journal: "JRN",
  WireSent: "WIR",
  MiscCashEntry: "MSC",
  ServiceFee: "FEE",
  Unknown: "???",
};

const ACTION_STYLES: Record<string, string> = {
  SellToOpen: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  BuyToClose: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  Expired: "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-gray-200",
  Assigned: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  Buy: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  Sell: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
};

function describe(t: Transaction): string {
  if (t.option) {
    const e = `${t.option.expiry.slice(5, 7)}/${t.option.expiry.slice(8, 10)}`;
    return `${t.option.ticker} ${e} $${t.option.strike.toFixed(2)} ${t.option.type[0]} × ${t.quantity}`;
  }
  if (t.ticker) {
    return `${t.ticker} ${t.quantity ? `× ${t.quantity}` : ""}`;
  }
  return t.raw.Description ?? t.rawAction;
}

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

  const allActions = useMemo(() => {
    const seen = new Map<Action, string>();
    for (const t of transactions) {
      if (!seen.has(t.action)) seen.set(t.action, t.rawAction);
    }
    return Array.from(seen.keys()).sort();
  }, [transactions]);

  const allTickers = useMemo(
    () =>
      Array.from(
        new Set(transactions.map((t) => t.ticker).filter((x): x is string => !!x)),
      ).sort(),
    [transactions],
  );

  const filtered = useMemo(
    () => sortTransactions(filterTransactions(transactions, filter), sort),
    [transactions, filter, sort],
  );

  const netAmount = filtered.reduce((a, t) => a + t.amount, 0);

  const toggleAction = (a: Action) => {
    const next = new Set(filter.actions);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    updateQuery({ ...filter, actions: next }, sort);
  };
  const toggleTicker = (t: string) => {
    const next = new Set(filter.tickers);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    updateQuery({ ...filter, tickers: next }, sort);
  };
  const setFrom = (v: string) =>
    updateQuery({ ...filter, from: v || undefined }, sort);
  const setTo = (v: string) =>
    updateQuery({ ...filter, to: v || undefined }, sort);
  const setQ = (v: string) => updateQuery({ ...filter, q: v }, sort);
  const setSort = (key: TransactionsSortKey) => {
    const nextDir =
      sort.key === key ? (sort.dir === "asc" ? "desc" : "asc") : "desc";
    updateQuery(filter, { key, dir: nextDir });
  };
  const clearAll = () =>
    updateQuery(
      { actions: new Set(), tickers: new Set(), q: "" },
      { key: "tradeDate", dir: "desc" },
    );

  const hasFilter =
    filter.actions.size > 0 ||
    filter.tickers.size > 0 ||
    filter.from != null ||
    filter.to != null ||
    filter.q.trim().length > 0;

  const arrow = (key: TransactionsSortKey) =>
    sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
          Transactions
        </h3>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} matching · net{" "}
          <span
            className={
              netAmount >= 0
                ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                : "text-rose-700 dark:text-rose-400 font-semibold"
            }
          >
            {netAmount === 0
              ? "$0.00"
              : `${netAmount >= 0 ? "+" : "−"}${formatCurrency(Math.abs(netAmount))}`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
            Action
          </div>
          <div className="flex flex-wrap gap-1">
            {allActions.map((a) => {
              const on = filter.actions.has(a);
              return (
                <button
                  key={a}
                  onClick={() => toggleAction(a)}
                  className={`px-2 py-0.5 rounded border text-[11px] ${
                    on
                      ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
                      : "bg-white dark:bg-neutral-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-neutral-700"
                  }`}
                >
                  {ACTION_LABEL[a] ?? a}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
            Ticker
          </div>
          <div className="flex flex-wrap gap-1">
            {allTickers.map((t) => {
              const on = filter.tickers.has(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTicker(t)}
                  className={`px-2 py-0.5 rounded border text-[11px] ${
                    on
                      ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
                      : "bg-white dark:bg-neutral-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-neutral-700"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-2 items-end">
          <label className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
              From (trade date)
            </div>
            <input
              type="date"
              value={filter.from ?? ""}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
              To
            </div>
            <input
              type="date"
              value={filter.to ?? ""}
              onChange={(e) => setTo(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100"
            />
          </label>
        </div>
        <div className="flex gap-2 items-end">
          <label className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
              Search
            </div>
            <input
              placeholder="ticker or description…"
              value={filter.q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </label>
          {hasFilter && (
            <button
              onClick={clearAll}
              className="text-[11px] px-2 py-1 border border-gray-300 dark:border-neutral-700 rounded hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-gray-300"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-4">
          No transactions match these filters.
        </p>
      ) : (
        <div>
          <div className="grid grid-cols-[100px_1fr_120px] gap-2 py-1 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-neutral-800">
            <span
              className="cursor-pointer select-none"
              onClick={() => setSort("tradeDate")}
            >
              Date{arrow("tradeDate")}
            </span>
            <span>Description</span>
            <span
              className="text-right cursor-pointer select-none"
              onClick={() => setSort("amount")}
            >
              Amount{arrow("amount")}
            </span>
          </div>
          {filtered.map((t, i) => (
            <div
              key={i}
              className="grid grid-cols-[100px_1fr_120px] gap-2 py-1.5 border-b border-gray-100 dark:border-neutral-800 last:border-0 text-xs"
            >
              <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                {t.tradeDate.slice(5).replace("-", "/")}
              </span>
              <span>
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1 ${
                    ACTION_STYLES[t.action] ??
                    "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-gray-200"
                  }`}
                >
                  {ACTION_LABEL[t.action] ?? t.action}
                </span>
                {describe(t)}
              </span>
              <span
                className={`text-right tabular-nums font-semibold ${
                  t.amount > 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : t.amount < 0
                      ? "text-red-700 dark:text-red-400"
                      : "text-gray-400 dark:text-gray-500"
                }`}
              >
                {t.amount === 0 ? "—" : formatCurrency(t.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Shrink `TransactionLogCard` to a preview (remove embedded filter UI)**

Replace `app/components/TransactionLogCard.tsx` with:

```tsx
import Link from "next/link";
import type { Transaction } from "@/lib/csv/types";
import { formatCurrency } from "@/lib/util/money";

type Props = { transactions: Transaction[] };

const PREVIEW_COUNT = 10;

const ACTION_LABEL: Record<string, string> = {
  SellToOpen: "STO",
  BuyToClose: "BTC",
  Expired: "EXP",
  Assigned: "ASN",
  Buy: "BUY",
  Sell: "SELL",
  QualifiedDividend: "DIV",
  BankInterest: "INT",
  CreditInterest: "INT",
  Journal: "JRN",
  WireSent: "WIR",
  MiscCashEntry: "MSC",
  ServiceFee: "FEE",
  Unknown: "???",
};

const ACTION_STYLES: Record<string, string> = {
  SellToOpen: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  BuyToClose: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  Expired: "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-gray-200",
  Assigned: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  Buy: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  Sell: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
};

function describe(t: Transaction): string {
  if (t.option) {
    const e = `${t.option.expiry.slice(5, 7)}/${t.option.expiry.slice(8, 10)}`;
    return `${t.option.ticker} ${e} $${t.option.strike.toFixed(2)} ${t.option.type[0]} × ${t.quantity}`;
  }
  if (t.ticker) {
    return `${t.ticker} ${t.quantity ? `× ${t.quantity}` : ""}`;
  }
  return t.raw.Description ?? t.rawAction;
}

export function TransactionLogCard({ transactions }: Props) {
  const sorted = [...transactions].sort((a, b) =>
    a.tradeDate < b.tradeDate ? 1 : a.tradeDate > b.tradeDate ? -1 : 0,
  );
  const preview = sorted.slice(0, PREVIEW_COUNT);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-baseline justify-between mb-0.5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
          Transaction log
        </h3>
        {sorted.length > 0 && (
          <Link
            href="/transactions"
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            View all {sorted.length} →
          </Link>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Most recent {preview.length} of {sorted.length}.
      </p>

      <div>
        {preview.map((t, i) => (
          <div
            key={i}
            className="grid grid-cols-[72px_1fr_100px] gap-2 py-1.5 border-b border-gray-100 dark:border-neutral-800 last:border-0 text-xs"
          >
            <span className="text-gray-500 dark:text-gray-400 tabular-nums">
              {t.tradeDate.slice(5).replace("-", "/")}
            </span>
            <span>
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1 ${
                  ACTION_STYLES[t.action] ??
                  "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-gray-200"
                }`}
              >
                {ACTION_LABEL[t.action] ?? t.action}
              </span>
              {describe(t)}
            </span>
            <span
              className={`text-right tabular-nums font-semibold ${
                t.amount > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : t.amount < 0
                    ? "text-red-700 dark:text-red-400"
                    : "text-gray-400 dark:text-gray-500"
              }`}
            >
              {t.amount === 0 ? "—" : formatCurrency(t.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git status
git diff --cached
git add app/transactions/ app/components/TransactionsPageClient.tsx app/components/TransactionLogCard.tsx
git commit -m "$(cat <<'EOF'
Add /transactions page with URL-synced filters + shrink dashboard card

/transactions renders action/ticker/date/search filters with sortable
date and amount columns. Dashboard's TransactionLogCard becomes a
10-row preview; its embedded filter UI moves to the full page.

Closes #13

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Manual smoke test in a browser

No code changes. This confirms the UX spec against reality. Start the dev server yourself (`! npm run dev`) since the sandbox can't bind a port.

- [ ] **Step 1: Start dev server**

In your terminal: `npm run dev`

- [ ] **Step 2: Verify shared nav**

Open `http://localhost:3000/`. Confirm a nav bar is visible at the top with `Demo · Dashboard · Trades · Transactions`. The active link (Dashboard) is bold/darker than the others.

- [ ] **Step 3: Verify dashboard previews**

On `/`, scroll to the Closed trades card — should show at most 5 rows and a `View all N →` link. Scroll to the Transaction log card — at most 10 rows, link present, no embedded search/action filter.

- [ ] **Step 4: Verify `/trades` filters and URL sync**

Click `View all N →` on Closed trades. On `/trades`:
- Toggle a ticker chip — URL should update to include `?ticker=<TICKER>`. Reload — filter persists.
- Toggle an outcome chip — URL includes `&outcome=...`.
- Set a From date — URL includes `&from=YYYY-MM-DD`. Set To.
- Click the `Closed` header — URL `sort=closeDate:asc`; click again → removed (back to default desc).
- Click `Held` header → URL `sort=daysHeld:desc`. Click `P&L` header → `sort=netPnL:desc`.
- Count + net P&L in the header should update as filters narrow.
- Click `Clear all` — URL drops all filters.

- [ ] **Step 5: Verify `/transactions` filters and URL sync**

Navigate to `/transactions`:
- Toggle an action chip, a ticker chip, type in the search box, set a date range — URL updates.
- Click `Date` header to toggle asc/desc.
- Click `Amount` header.
- Clear all works.

- [ ] **Step 6: Verify empty states**

On `/trades`, apply filters that match nothing (e.g., two incompatible outcomes + a date range that excludes everything). Confirm the "No trades match these filters." empty state renders. Same on `/transactions`.

- [ ] **Step 7: Verify dark mode parity**

If your system is in dark mode (or toggle via devtools → prefer-color-scheme), confirm nav, filter chips, inputs, table headers, and sort arrows all render with dark-mode colors correctly on both pages.

- [ ] **Step 8: Verify pages load fast (no market-data fetch)**

Open devtools Network, navigate to `/trades`. Confirm no `query1.finance.yahoo.com` request is made for that page load. Same on `/transactions`.

- [ ] **Step 9: Done — stop the dev server**

No commit for this task (manual verification only). If you found issues, return to the relevant task and fix; otherwise proceed to finishing-a-development-branch.
