# Closed Trades Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a flat, newest-first ledger of closed option trades (one row per FIFO-matched open/close slice) as a new `TradeHistoryCard` tile on the dashboard, driven by a pure `computeClosedTrades` derivation.

**Architecture:** New pure module `lib/model/metrics/trades.ts` groups transactions by contract key (`ticker|expiry|strike|type`), walks events in date order, and produces one `ClosedTrade` per FIFO slice between a `SellToOpen` and a matching `BuyToClose` / `Expired` / `Assigned`. Option-leg P&L only; fees pro-rated per slice. `buildPortfolio` attaches the resulting `ClosedTrade[]` to `PortfolioState.closedTrades`. A new `TradeHistoryCard` renders a 7-column table sorted by close date desc, with an outcome badge per row.

**Tech Stack:** TypeScript 5, Vitest, Next.js 16 App Router (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-04-23-closed-trades-ledger-design.md`

**Branch strategy:** Session pattern is direct-to-`main` in small commits; each task below ends with one commit. Switch to `fix/6-closed-trades-ledger` + PR only if that's your preference.

**Pre-flight (before Task 1):**
- Confirm clean working tree: `git status`
- Confirm tests pass on the base: `npm test`

---

## File Structure

**Create:**
- `lib/model/metrics/trades.ts` — types (`TradeOutcome`, `ClosedTrade`) + pure `computeClosedTrades` derivation
- `tests/model/metrics/trades.test.ts`
- `app/components/TradeHistoryCard.tsx`

**Modify:**
- `lib/model/types.ts` — add `closedTrades?: ClosedTrade[]` to `PortfolioState`; re-export `ClosedTrade` and `TradeOutcome`
- `lib/model/portfolio.ts` — call `computeClosedTrades(txs)` and attach to returned state
- `app/page.tsx` — render `<TradeHistoryCard state={state} />` in a new full-width row below `TransactionLogCard`
- `tests/integration.test.ts` — shape assertion on `state.closedTrades`

---

## Task 1: Types + stub derivation + state wiring

**Files:**
- Create: `lib/model/metrics/trades.ts` (types + stub)
- Modify: `lib/model/types.ts`
- Modify: `lib/model/portfolio.ts`

Keep everything green and end-to-end before adding real logic. The stub returns `[]`; the real algorithm replaces it in Task 2. This way Task 2 is pure TDD of the algorithm with zero scaffolding noise.

- [ ] **Step 1: Create `lib/model/metrics/trades.ts` with types + stub**

Write:

```ts
import type { OptionLeg, Transaction } from "@/lib/csv/types";

export type TradeOutcome =
  | "Expired"
  | "ClosedProfit"
  | "ClosedLoss"
  | "Assigned";

export type ClosedTrade = {
  contract: OptionLeg;
  openDate: string;
  openPrice: number;
  closeDate: string;
  closePrice: number;
  qty: number;
  outcome: TradeOutcome;
  daysHeld: number;
  netPnL: number;
};

export function computeClosedTrades(
  _transactions: Transaction[],
): ClosedTrade[] {
  // Stub — real algorithm lands in the next commit.
  return [];
}
```

- [ ] **Step 2: Extend `lib/model/types.ts`**

Add `closedTrades?: ClosedTrade[]` to `PortfolioState`:

```ts
export type PortfolioState = {
  config: Config;
  transactions: Transaction[];
  cashLedger: CashPoint[];
  externalFlows: FlowPoint[];
  navSeries: NavPoint[];
  portfolioValueSeries?: NavPoint[];
  openOptionPositions: OpenOption[];
  openSharePositions: OpenShare[];
  premiumSeries: PremiumPoint[];
  premiumTotals: { gross: number; closed: number; net: number };
  closedTrades?: ClosedTrade[];
  warnings: Warning[];
};
```

And at the bottom of the file, re-export the new types so consumers can import them from `@/lib/model/types`:

```ts
export type { ClosedTrade, TradeOutcome } from "@/lib/model/metrics/trades";
```

Don't forget to add a top-of-file `import type { ClosedTrade } from "@/lib/model/metrics/trades";` near the other imports so the `PortfolioState` reference resolves.

- [ ] **Step 3: Wire `computeClosedTrades` into `buildPortfolio`**

Open `lib/model/portfolio.ts`. Add the import:

```ts
import { computeClosedTrades } from "@/lib/model/metrics/trades";
```

Inside `buildPortfolio`, after the existing derivations (near `const premiumTotals = ...`), add:

```ts
const closedTrades = computeClosedTrades(txs);
```

Then include it in the returned state object:

```ts
return {
  config,
  transactions: txs,
  cashLedger: cash.cashLedger,
  externalFlows: cash.externalFlows,
  navSeries,
  openOptionPositions: openOptions,
  openSharePositions: openShares,
  premiumSeries,
  premiumTotals,
  closedTrades,
  warnings,
};
```

- [ ] **Step 4: Verify green**

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm test`
Expected: all tests pass (no behavior change — stub returns `[]`).

- [ ] **Step 5: Commit**

```bash
git add lib/model/metrics/trades.ts lib/model/types.ts lib/model/portfolio.ts
git commit -m "Scaffold ClosedTrade types and attach to PortfolioState

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Real `computeClosedTrades` algorithm (TDD)

**Files:**
- Modify: `lib/model/metrics/trades.ts`
- Create: `tests/model/metrics/trades.test.ts`

Full TDD of the FIFO pairing algorithm. Tests cover: profitable close, loss close, expired, assigned, partial close (one STO sliced across multiple closes), multi-STO closed by a single close, same-day roll, pro-rata fee apportionment, and orphaned close (no open lot).

- [ ] **Step 1: Write the failing tests**

Write `tests/model/metrics/trades.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeClosedTrades } from "@/lib/model/metrics/trades";
import type { Transaction } from "@/lib/csv/types";

type Opt = {
  ticker: string;
  expiry: string;
  strike: number;
  type: "Put" | "Call";
};

function opt(
  ticker: string,
  expiry: string,
  strike: number,
  type: "Put" | "Call",
): Opt {
  return { ticker, expiry, strike, type };
}

function sto(
  date: string,
  o: Opt,
  qty: number,
  price: number,
  fees = 0,
): Transaction {
  return {
    tradeDate: date,
    action: "SellToOpen",
    quantity: qty,
    price,
    fees,
    amount: qty * price * 100 - fees,
    option: o,
    raw: {
      Date: date,
      Action: "Sell to Open",
      Symbol: "",
      Description: "",
      Quantity: String(qty),
      Price: String(price),
      "Fees & Comm": String(fees),
      Amount: "",
    },
    rawAction: "Sell to Open",
  };
}

function btc(
  date: string,
  o: Opt,
  qty: number,
  price: number,
  fees = 0,
): Transaction {
  return {
    tradeDate: date,
    action: "BuyToClose",
    quantity: qty,
    price,
    fees,
    amount: -(qty * price * 100) - fees,
    option: o,
    raw: {
      Date: date,
      Action: "Buy to Close",
      Symbol: "",
      Description: "",
      Quantity: String(qty),
      Price: String(price),
      "Fees & Comm": String(fees),
      Amount: "",
    },
    rawAction: "Buy to Close",
  };
}

function expired(date: string, o: Opt, qty: number): Transaction {
  return {
    tradeDate: date,
    action: "Expired",
    quantity: qty,
    fees: 0,
    amount: 0,
    option: o,
    raw: {
      Date: date,
      Action: "Expired",
      Symbol: "",
      Description: "",
      Quantity: String(qty),
      Price: "",
      "Fees & Comm": "0",
      Amount: "0",
    },
    rawAction: "Expired",
  };
}

function assigned(date: string, o: Opt, qty: number): Transaction {
  return {
    tradeDate: date,
    action: "Assigned",
    quantity: qty,
    fees: 0,
    amount: 0,
    option: o,
    raw: {
      Date: date,
      Action: "Assigned",
      Symbol: "",
      Description: "",
      Quantity: String(qty),
      Price: "",
      "Fees & Comm": "0",
      Amount: "0",
    },
    rawAction: "Assigned",
  };
}

describe("computeClosedTrades", () => {
  const O = opt("ACME", "2026-04-17", 55, "Call");

  it("produces a ClosedProfit row when STO is bought back at a lower price", () => {
    const trades = computeClosedTrades([
      sto("2026-03-10", O, 1, 1.2),
      btc("2026-04-01", O, 1, 0.4),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      contract: O,
      openDate: "2026-03-10",
      openPrice: 1.2,
      closeDate: "2026-04-01",
      closePrice: 0.4,
      qty: 1,
      outcome: "ClosedProfit",
      daysHeld: 22,
    });
    expect(trades[0].netPnL).toBeCloseTo((1.2 - 0.4) * 100 * 1);
  });

  it("produces a ClosedLoss row when STO is bought back at a higher price", () => {
    const trades = computeClosedTrades([
      sto("2026-03-10", O, 1, 0.4),
      btc("2026-04-01", O, 1, 1.2),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].outcome).toBe("ClosedLoss");
    expect(trades[0].netPnL).toBeCloseTo((0.4 - 1.2) * 100 * 1);
  });

  it('produces an Expired row with closePrice=0 and full premium as P&L', () => {
    const trades = computeClosedTrades([
      sto("2026-03-10", O, 1, 1.0),
      expired("2026-04-17", O, 1),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      outcome: "Expired",
      closePrice: 0,
      qty: 1,
    });
    expect(trades[0].netPnL).toBeCloseTo(1.0 * 100);
  });

  it('produces an Assigned row with closePrice=0', () => {
    const trades = computeClosedTrades([
      sto("2026-03-10", O, 1, 1.0),
      assigned("2026-04-17", O, 1),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      outcome: "Assigned",
      closePrice: 0,
    });
    expect(trades[0].netPnL).toBeCloseTo(100);
  });

  it("emits one row per FIFO-matched slice when one STO is closed across multiple BTCs", () => {
    const trades = computeClosedTrades([
      sto("2026-03-10", O, 3, 1.0),
      btc("2026-03-20", O, 1, 0.5),
      btc("2026-04-01", O, 2, 0.2),
    ]);
    expect(trades).toHaveLength(2);

    expect(trades[0]).toMatchObject({
      openDate: "2026-03-10",
      openPrice: 1.0,
      closeDate: "2026-03-20",
      closePrice: 0.5,
      qty: 1,
    });
    expect(trades[1]).toMatchObject({
      openDate: "2026-03-10",
      openPrice: 1.0,
      closeDate: "2026-04-01",
      closePrice: 0.2,
      qty: 2,
    });
  });

  it("pairs multiple STOs of the same contract FIFO against a single large BTC", () => {
    const trades = computeClosedTrades([
      sto("2026-03-10", O, 2, 1.0),
      sto("2026-03-12", O, 1, 0.8),
      btc("2026-04-01", O, 3, 0.3),
    ]);
    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({
      openDate: "2026-03-10",
      openPrice: 1.0,
      qty: 2,
    });
    expect(trades[1]).toMatchObject({
      openDate: "2026-03-12",
      openPrice: 0.8,
      qty: 1,
    });
  });

  it("treats a same-day BTC+STO roll as two independent events on different contracts", () => {
    const X = opt("ACME", "2026-04-17", 55, "Call");
    const Y = opt("ACME", "2026-05-15", 55, "Call");
    const trades = computeClosedTrades([
      sto("2026-03-10", X, 1, 1.2),
      btc("2026-04-10", X, 1, 0.4),
      sto("2026-04-10", Y, 1, 1.5),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].contract).toEqual(X);
    expect(trades[0].closeDate).toBe("2026-04-10");
  });

  it("apportions fees pro-rata across FIFO slices", () => {
    // STO with $0.60 open fees on 3 contracts → $0.20/contract
    // BTC(1) at $0.10 with $0.10 fee → close fee $0.10/contract (only 1 close so full fee)
    // BTC(2) at $0.05 with $0.10 fee → close fee $0.05/contract
    const trades = computeClosedTrades([
      sto("2026-03-10", O, 3, 1.0, 0.6),
      btc("2026-03-20", O, 1, 0.1, 0.1),
      btc("2026-04-01", O, 2, 0.05, 0.1),
    ]);
    expect(trades).toHaveLength(2);

    // Slice 1 (qty=1): gross = (1.0 - 0.1) * 100 * 1 = 90; open fee = 0.20; close fee = 0.10; net = 89.70
    expect(trades[0].netPnL).toBeCloseTo(90 - 0.2 - 0.1);

    // Slice 2 (qty=2): gross = (1.0 - 0.05) * 100 * 2 = 190; open fee = 0.40; close fee = 0.10; net = 189.50
    expect(trades[1].netPnL).toBeCloseTo(190 - 0.4 - 0.1);
  });

  it("silently skips orphan closes (close event with no open lot)", () => {
    const trades = computeClosedTrades([
      btc("2026-04-01", O, 1, 0.1),
    ]);
    expect(trades).toEqual([]);
  });

  it("reports zero daysHeld for same-day open and close", () => {
    const trades = computeClosedTrades([
      sto("2026-03-10", O, 1, 1.0),
      btc("2026-03-10", O, 1, 0.5),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0].daysHeld).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/model/metrics/trades.test.ts`
Expected: most tests FAIL (stub returns `[]` so any test expecting a row fails). The orphan-close test passes (`[]` matches `[]`).

- [ ] **Step 3: Replace the stub with the real implementation**

Open `lib/model/metrics/trades.ts`. Replace the whole file with:

```ts
import type { OptionLeg, Transaction } from "@/lib/csv/types";

export type TradeOutcome =
  | "Expired"
  | "ClosedProfit"
  | "ClosedLoss"
  | "Assigned";

export type ClosedTrade = {
  contract: OptionLeg;
  openDate: string;
  openPrice: number;
  closeDate: string;
  closePrice: number;
  qty: number;
  outcome: TradeOutcome;
  daysHeld: number;
  netPnL: number;
};

type OpenLot = {
  date: string;
  price: number;
  qty: number;
  feePerContract: number;
};

function contractKey(o: OptionLeg): string {
  return `${o.ticker}|${o.expiry}|${o.strike}|${o.type}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(to) - Date.parse(from)) / 86_400_000,
  );
}

export function computeClosedTrades(
  transactions: Transaction[],
): ClosedTrade[] {
  const relevant = transactions.filter((t) => t.option != null);
  const sorted = [...relevant].sort((a, b) =>
    a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0,
  );

  const queues = new Map<string, OpenLot[]>();
  const trades: ClosedTrade[] = [];

  for (const t of sorted) {
    if (!t.option) continue;
    const key = contractKey(t.option);

    if (t.action === "SellToOpen") {
      const qty = t.quantity;
      if (qty <= 0) continue;
      const price = t.price ?? 0;
      const feePerContract = (t.fees ?? 0) / qty;
      const list = queues.get(key) ?? [];
      list.push({ date: t.tradeDate, price, qty, feePerContract });
      queues.set(key, list);
      continue;
    }

    if (
      t.action !== "BuyToClose" &&
      t.action !== "Expired" &&
      t.action !== "Assigned"
    ) {
      continue;
    }

    const closePrice =
      t.action === "BuyToClose" ? t.price ?? 0 : 0;
    const eventQty = t.quantity;
    if (eventQty <= 0) continue;
    const eventFeePerContract = (t.fees ?? 0) / eventQty;

    let remaining = eventQty;
    const queue = queues.get(key) ?? [];

    while (remaining > 0 && queue.length > 0) {
      const front = queue[0];
      const slice = Math.min(front.qty, remaining);

      const gross = (front.price - closePrice) * 100 * slice;
      const openFees = front.feePerContract * slice;
      const closeFees = eventFeePerContract * slice;
      const netPnL = gross - openFees - closeFees;

      const outcome: TradeOutcome =
        t.action === "Expired"
          ? "Expired"
          : t.action === "Assigned"
            ? "Assigned"
            : netPnL >= 0
              ? "ClosedProfit"
              : "ClosedLoss";

      trades.push({
        contract: t.option,
        openDate: front.date,
        openPrice: front.price,
        closeDate: t.tradeDate,
        closePrice,
        qty: slice,
        outcome,
        daysHeld: daysBetween(front.date, t.tradeDate),
        netPnL,
      });

      front.qty -= slice;
      if (front.qty === 0) queue.shift();
      remaining -= slice;
    }

    if (queue.length === 0) queues.delete(key);
    else queues.set(key, queue);
  }

  return trades;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/model/metrics/trades.test.ts`
Expected: all 10 tests PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add lib/model/metrics/trades.ts tests/model/metrics/trades.test.ts
git commit -m "Implement computeClosedTrades: FIFO pairing with pro-rata fees

Walks transactions in date order, grouped by contract key. Every
BuyToClose / Expired / Assigned slices the front of the open-lot queue
for its contract FIFO, emitting one ClosedTrade per matched slice.
Fees are pro-rated per contract. Orphan closes (no open lot) are
skipped silently.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: TradeHistoryCard component + page integration

**Files:**
- Create: `app/components/TradeHistoryCard.tsx`
- Modify: `app/page.tsx`
- Modify: `tests/integration.test.ts`

- [ ] **Step 1: Create `app/components/TradeHistoryCard.tsx`**

Write:

```tsx
import type { ClosedTrade, PortfolioState, TradeOutcome } from "@/lib/model/types";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState };

function outcomeBadgeClasses(outcome: TradeOutcome): string {
  if (outcome === "ClosedLoss") {
    return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300";
  }
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
}

function outcomeLabel(outcome: TradeOutcome): string {
  switch (outcome) {
    case "Expired":
      return "Expired";
    case "Assigned":
      return "Assigned";
    case "ClosedProfit":
      return "Profit";
    case "ClosedLoss":
      return "Loss";
  }
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
  const trades = sortedDesc(state.closedTrades ?? []);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        Closed trades
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Every option contract that has been closed, expired, or assigned —
        one row per FIFO-matched slice.
      </p>
      {trades.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
          No closed trades yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-neutral-800">
                <th className="py-1.5 pr-3">Contract</th>
                <th className="py-1.5 pr-3">Opened</th>
                <th className="py-1.5 pr-3">Closed</th>
                <th className="py-1.5 pr-3 text-right">Qty</th>
                <th className="py-1.5 pr-3 text-right">Held</th>
                <th className="py-1.5 pr-3">Outcome</th>
                <th className="py-1.5 text-right">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
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
                      {outcomeLabel(t.outcome)}
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

- [ ] **Step 2: Wire into `app/page.tsx`**

Open `app/page.tsx`. Add the import near the other card imports:

```ts
import { TradeHistoryCard } from "@/app/components/TradeHistoryCard";
```

Find the row that contains `TransactionLogCard`. Directly below it, add a new full-width row with the new card. If the existing layout uses a `<div className="grid grid-cols-*">` wrapper for rows, copy that pattern — for a single full-width card, a full-width wrapper div is fine:

```tsx
<div className="mb-4">
  <TradeHistoryCard state={state} />
</div>
```

(If you see the current page uses a consistent margin/grid pattern, match it — don't introduce a new one. The key property: this card should sit full-width on its own row, below Transaction Log.)

- [ ] **Step 3: Extend the integration test**

In `tests/integration.test.ts`, inside the existing `describe("loadDashboard", ...)` block, add:

```ts
it("exposes closedTrades on PortfolioState when dashboard is ready", async () => {
  const result = await loadDashboard();
  if (result.kind !== "ready") return;

  expect(Array.isArray(result.state.closedTrades)).toBe(true);

  for (const t of result.state.closedTrades ?? []) {
    expect(typeof t.contract.ticker).toBe("string");
    expect(["Put", "Call"]).toContain(t.contract.type);
    expect(typeof t.openDate).toBe("string");
    expect(typeof t.closeDate).toBe("string");
    expect(["Expired", "Assigned", "ClosedProfit", "ClosedLoss"]).toContain(
      t.outcome,
    );
    expect(Number.isFinite(t.netPnL)).toBe(true);
  }
});
```

- [ ] **Step 4: Typecheck + lint + tests**

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm run lint`
Expected: 0 errors (pre-existing `mkdirSync` warning in `quotes.test.ts` is fine).

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Visual smoke**

Run `npm run dev` (disable sandbox if needed). Open `http://localhost:3000`. Verify:

- A new "Closed trades" card renders below the Transaction Log row.
- Rows are sorted newest-close-first.
- Outcome badges render with the right color: `Closed +`, `Expired`, `Assigned` all emerald; `Closed −` rose.
- Dark mode renders cleanly (toggle your OS theme if needed).
- Hand-check a handful of rows against the transactions CSV — the paired `SellToOpen` and its close should match.

- [ ] **Step 6: Commit**

```bash
git add app/components/TradeHistoryCard.tsx app/page.tsx tests/integration.test.ts
git commit -m "Render TradeHistoryCard below the Transaction Log row

Closes #6.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: End-to-end smoke**

Reload `http://localhost:3000`. Verify:

- Closed trades card renders with real data
- Badge colors correct (profit/expired/assigned vs. loss)
- Row count ≈ total option close events you've had (expired + BTC + assigned)
- Sort order is newest close-date first
- No console errors
- Page layout: new card sits in its own full-width row below Transaction Log

- [ ] **Step 5: Hygiene check before PR (if using PR flow)**

Run: `git status && git diff --cached`
Verify: no real financial data staged.

- [ ] **Step 6: Open PR (if using PR flow)**

```bash
git push -u origin fix/6-closed-trades-ledger
gh pr create --title "Closed trades ledger (closes #6)" --body "$(cat <<'EOF'
## Summary
- New pure `computeClosedTrades` derivation: FIFO pairing per contract key, pro-rated fees, option-leg P&L only.
- New `TradeHistoryCard` below the Transaction Log row: sorted newest-first, 7 columns, outcome badges.
- `PortfolioState.closedTrades` attached by `buildPortfolio`; shape asserted in the integration test.

Closes #6.

## Test plan
- [x] Vitest: 10 unit tests covering profit/loss/expired/assigned/partial/multi-STO/roll/fees/orphan/same-day
- [x] Typecheck + lint clean
- [ ] Manual smoke: card renders with real data, badges correct, sort order newest-first

*Co-authored by Claude*
EOF
)"
```
