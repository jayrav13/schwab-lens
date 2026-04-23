# Closed Trades Ledger — Design

**Date:** 2026-04-23
**Status:** Draft — awaiting review
**Issue:** [#6](https://github.com/jayrav13/schwab-lens/issues/6)

## Problem

The dashboard shows *currently open* option positions and *current* P&L aggregates, but there's no view of the historical lifecycle of each closed contract. A wheel trader reviewing past performance wants to answer: "for every option I sold to open, when did it close, for how much, and what was the net P&L on that leg?" The covered-call spreadsheet this dashboard replaces had exactly this view; the dashboard currently does not.

## Goals

- Produce a flat, auditable list of *closed option trades* — one record per `(open slice, close event)` pair.
- Show the full lifecycle of each slice: open date/price, close date/price, qty, outcome, days held, net P&L.
- Handle partial closes correctly: if a `SellToOpen(3)` is followed by `BuyToClose(1)` then `BuyToClose(2)`, produce two closed-trade rows.
- Handle rolls idempotently: a same-day `BuyToClose` + `SellToOpen` of a *different* contract are two independent events; the BTC closes a prior open lot and the new STO opens a new lot. Nothing special about same-day.
- Render a new `TradeHistoryCard` below the existing row of cards.

## Non-goals (this feature)

- Modeling "rolls" as a first-class linked concept in the data (rolls are inferrable from transaction proximity; not needed for the ledger view).
- Including realized share P&L in `Assigned` rows. This card covers the *option leg* only. Share P&L belongs to the existing open-shares / NAV surfaces.
- Showing still-open contracts or partial-close remainders in this card. Open state already lives in `OpenPositionsCard`.
- Editing / annotating trades (tagging roll-chains, flagging errors). Deferred.
- Exporting to CSV.
- Historical tax-lot accounting for the options themselves.

## Design summary

- **New pure derivation** `lib/model/metrics/trades.ts` exporting `computeClosedTrades(transactions) → ClosedTrade[]`.
- **FIFO pairing per contract key**: walk transactions grouped by `ticker|expiry|strike|type`, push `SellToOpen` onto a queue, and slice off the front on every `BuyToClose` / `Expired` / `Assigned`. Each slice emits exactly one `ClosedTrade`.
- **Option-leg P&L only.** Close price is `0` for `Expired` and `Assigned`. `Assigned` rows are a flag + premium kept; share-side P&L stays in the shares ledger.
- **Pro-rata fee apportionment** when an open lot is sliced across multiple closes.
- **Attached to `PortfolioState`** as `closedTrades?: ClosedTrade[]`, computed once in `buildPortfolio`.
- **New card** `TradeHistoryCard` renders a 7-column table sorted by `closeDate` desc. Outcome badges: `Expired` / `ClosedProfit` / `Assigned` emerald, `ClosedLoss` rose.

## Data model

```ts
// lib/model/metrics/trades.ts

export type TradeOutcome =
  | "Expired"
  | "ClosedProfit"
  | "ClosedLoss"
  | "Assigned";

export type ClosedTrade = {
  contract: OptionLeg;      // ticker, expiry, strike, type
  openDate: string;         // YYYY-MM-DD, from the matched SellToOpen
  openPrice: number;        // per contract, from the matched SellToOpen
  closeDate: string;        // YYYY-MM-DD, from the close event
  closePrice: number;       // per contract — 0 for Expired and Assigned
  qty: number;              // slice size (= openQty = closeQty for this slice)
  outcome: TradeOutcome;
  daysHeld: number;         // closeDate - openDate in calendar days
  netPnL: number;           // (openPrice - closePrice) × 100 × qty − fees (pro-rated)
};
```

Field notes:

- `qty` is the *slice* size, not the original open lot size. A `SellToOpen(3)` closed by two BTCs produces two rows with `qty=1` and `qty=2`.
- `netPnL` uses `100` as the standard option multiplier. The app does not attempt to handle non-standard contracts (adjusted splits, mini-options); those are out of scope and will need a dedicated issue if they show up.
- `daysHeld` is calendar days, computed as `(Date.parse(closeDate) - Date.parse(openDate)) / 86400000` rounded. A same-day open+close is `0`.

## Pairing algorithm

1. Group transactions by contract key `${ticker}|${expiry}|${strike}|${type}`, derived from `Transaction.option`.
2. Within each group, sort ascending by `tradeDate` (stable — preserve CSV order for same-day events).
3. Walk events in order. Maintain an open-lots queue per contract: `Array<{qty, price, date, feePerContract}>`.
4. For each event:
   - `SellToOpen` → push `{qty, price, date, feePerContract: fees / qty}`.
   - `BuyToClose(q)` → repeatedly pop from the front of the queue, slicing the front entry as needed:
     - Let `slice = min(front.qty, q)`. Emit a `ClosedTrade` with:
       - `openDate`, `openPrice` = front's date and price
       - `closeDate`, `closePrice` = event's date and price
       - `qty = slice`
       - `outcome = netPnL >= 0 ? "ClosedProfit" : "ClosedLoss"`
       - `netPnL = (front.price - event.price) × 100 × slice − (front.feePerContract × slice) − (event.fees × slice / event.qty)`
     - Decrement `front.qty` by `slice`; if `front.qty === 0`, remove it.
     - Decrement `q` by `slice`. Loop until `q === 0` or the queue is empty.
   - `Expired(q)` → same as `BuyToClose` but `closePrice = 0` and `outcome = "Expired"`.
   - `Assigned(q)` → same as `BuyToClose` but `closePrice = 0` and `outcome = "Assigned"`.
5. If an `Expired` / `BuyToClose` / `Assigned` event arrives for a contract with no open lots (already empty queue), skip silently — this is a data issue, not a crash.

**Rolls don't need special treatment.** A `BuyToClose` of contract X and `SellToOpen` of contract Y on the same day have different contract keys, so the algorithm processes them independently and produces one closed-trade row for X and one new open lot for Y. That's the desired behavior.

## Rendering (TradeHistoryCard)

New `app/components/TradeHistoryCard.tsx` renders a table. Added to `app/page.tsx` in its own full-width row below the existing Transaction Log row.

Columns:

| Contract | Opened | Closed | Qty | Held | Outcome | P&L |
|---|---|---|---|---|---|---|
| `<TICKER> $<STRIKE> <P/C> · <EXPIRY>` | `<date> · $<price>` | `<date> · $<price>` | `<n>` | `<n>d` | badge | `<signed currency>` |

- Sort: `closeDate` descending; for ties, `openDate` ascending (older open first).
- Outcome badges: `Expired` / `ClosedProfit` / `Assigned` → emerald-800/emerald-200 text on emerald background; `ClosedLoss` → rose-700 text on rose background. Matches the existing palette used in `OpenPositionsCard`.
- P&L coloring: positive green, negative red. Parenthesized negative is consistent with the rest of the dashboard's money formatting.
- Dark mode: existing Tailwind class conventions. Follow the pattern from `TransactionLogCard`.
- Empty state: `"No closed trades yet."` small gray text inside the card, no table rows.
- No pagination in v1. If row count exceeds ~200, we'll add virtualization behind a feature flag (separate issue).

## Data flow

```
transactions (from CSVs)
    │
    ▼
 buildPortfolio
    ├─► existing derivations …
    └─► computeClosedTrades(transactions) → ClosedTrade[]
                                   │
                                   ▼
                      state.closedTrades
                                   │
                                   ▼
                    <TradeHistoryCard state={state} />
```

No I/O. No new dependencies. No coupling to market-data or historical caches.

## Error handling

| Condition | Behavior |
|---|---|
| Close event for a contract with no open lots (empty queue) | Skip silently; do not throw. CSVs sometimes include orphans from prior-year activity. |
| Close `qty` exceeds total remaining open qty | Emit rows for what's available, stop when queue is empty. No warning in v1 (consider a future `OrphanedClose` warning variant). |
| Transaction with `option === null` but an option-looking action | Ignore — this code path only runs on `t.option !== null`. |
| Missing `price` on a close event | Treat as `0` (behavior is identical for the net-P&L math when `closePrice = 0`). |
| Missing `price` on an open event | Treat as `0`; the resulting `ClosedTrade` will have `openPrice = 0` — anomalous but non-crashing. |

## Edge cases

- **Same-day STO + close** (unusual but possible for day-traded options): `daysHeld === 0`, pairing is FIFO within the day by CSV order.
- **Multiple STOs of the same contract before any close**: queue accumulates; first STO is closed first (FIFO).
- **BTC with `qty > remaining open qty`** (oversell-to-close): emit what matches, the tail is silently dropped.
- **Fee precision**: JS floats may leave sub-cent residue after pro-rata splits. Acceptable for display; totals render with `formatCurrency` which rounds to 2 decimals.
- **Assigned + residual queue**: Schwab sometimes emits `Assigned` for partial qty (e.g. you had 3 short calls, 1 got assigned). Same FIFO slice.
- **`Expired` events at expiry**: Schwab emits `Expired` with `quantity` equal to whatever was open; the queue drains.

## Testing

- **`tests/model/metrics/trades.test.ts`** (new, pure)
  - Single STO → BTC profitable close (`ClosedProfit`, positive P&L)
  - Single STO → BTC at higher price (`ClosedLoss`, negative P&L)
  - Single STO → `Expired` (close price 0, outcome `Expired`)
  - Single STO → `Assigned` (close price 0, outcome `Assigned`, P&L = premium kept)
  - Partial close: STO(3) → BTC(1), BTC(2) → two rows with `qty=1` and `qty=2`, identical open fields, different close dates
  - Multiple opens before a single close: STO(2), STO(1), BTC(3) → two rows, each slice paired FIFO
  - Roll same-day: BTC of X + STO of Y on the same day → one closed-trade row for X, nothing for Y (open lot queued for future)
  - Fees pro-rate correctly: STO with $0.60 fee, 3 qty, closed 1+2 → first slice carries $0.20 open-fee share, second carries $0.40
  - Orphaned close (BTC with empty queue) → no row emitted, no throw

- **`tests/integration.test.ts`** (extend existing `loadDashboard` describe)
  - Assert `state.closedTrades` is present on a `ready` result
  - Assert each element conforms to the `ClosedTrade` shape (shape-only, not exact values)

- **Visual smoke** in dev:
  - Open the dashboard with real data → `TradeHistoryCard` renders with real closed option history
  - Verify newest-first order, badge colors, dark mode
  - Compare a handful of rows against expected transactions by hand

## Files

**New:**
- `lib/model/metrics/trades.ts`
- `app/components/TradeHistoryCard.tsx`
- `tests/model/metrics/trades.test.ts`

**Modified:**
- `lib/model/types.ts` — `closedTrades?: ClosedTrade[]` on `PortfolioState`; re-export `ClosedTrade` and `TradeOutcome`
- `lib/model/portfolio.ts` — one line in `buildPortfolio` to compute and attach `closedTrades`
- `app/page.tsx` — import `TradeHistoryCard` and add a new full-width row below `TransactionLogCard`
- `tests/integration.test.ts` — shape assertion on `closedTrades`

## Open questions

None — all design choices resolved in brainstorming.
