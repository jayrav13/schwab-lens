import { describe, it, expect } from "vitest";
import {
  computeShareLedger,
  computeOpenOptions,
} from "@/lib/model/metrics/positions";
import type { Transaction } from "@/lib/csv/types";
import type { Seed } from "@/lib/model/types";

const emptySeed: Seed = {
  asOf: "2025-12-31",
  cash: 0,
  initialShares: [],
  initialOptions: [],
};

function stoTx(overrides: Partial<Transaction> = {}): Transaction {
  const base: Transaction = {
    tradeDate: "2026-01-05",
    action: "SellToOpen",
    rawAction: "Sell to Open",
    ticker: "SOFI",
    option: { ticker: "SOFI", expiry: "2026-01-09", strike: 26, type: "Put" },
    quantity: 1,
    price: 0.09,
    fees: 0.66,
    amount: 8.34,
    raw: {} as Transaction["raw"],
  };
  return { ...base, ...overrides };
}

function buyTx(overrides: Partial<Transaction> = {}): Transaction {
  const base: Transaction = {
    tradeDate: "2026-01-30",
    action: "Buy",
    rawAction: "Buy",
    ticker: "CLSK",
    quantity: 200,
    price: 12,
    fees: 0,
    amount: -2400,
    raw: {} as Transaction["raw"],
  };
  return { ...base, ...overrides };
}

describe("computeShareLedger", () => {
  it("accumulates shares at weighted average cost", () => {
    const { openShares } = computeShareLedger(
      [
        buyTx({ ticker: "HL", quantity: 100, price: 28, amount: -2800 }),
        buyTx({ ticker: "HL", quantity: 100, price: 30, amount: -3000 }),
      ],
      emptySeed,
    );
    expect(openShares).toEqual([
      { ticker: "HL", shares: 200, weightedCostBasis: 29 },
    ]);
  });

  it("allows intra-day negative when Sell precedes Buy", () => {
    const { openShares, warnings } = computeShareLedger(
      [
        buyTx({
          ticker: "SGOV",
          quantity: 56,
          price: 100.3733,
          amount: 5620.89,
          action: "Sell",
          rawAction: "Sell",
          tradeDate: "2026-02-02",
        }),
        buyTx({
          ticker: "SGOV",
          quantity: 56,
          price: 100.3765,
          amount: -5621.08,
          action: "Buy",
          rawAction: "Buy",
          tradeDate: "2026-02-02",
        }),
      ],
      emptySeed,
    );
    expect(openShares).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("emits a warning on negative end-of-day position", () => {
    const { warnings } = computeShareLedger(
      [
        buyTx({
          ticker: "X",
          quantity: 50,
          price: 10,
          amount: 500,
          action: "Sell",
          rawAction: "Sell",
          tradeDate: "2026-01-10",
        }),
      ],
      emptySeed,
    );
    expect(warnings.some((w) => w.kind === "NegativeShareEndOfDay")).toBe(true);
  });
});

describe("computeOpenOptions", () => {
  it("nets a single STO to quantityOpen: 1 with the premium booked", () => {
    const opens = computeOpenOptions([stoTx()], emptySeed);
    expect(opens).toHaveLength(1);
    expect(opens[0].quantityOpen).toBe(1);
    expect(opens[0].netPremiumCollected).toBeCloseTo(8.34, 2);
  });

  it("round-trips STO + BTC to nothing open", () => {
    const opens = computeOpenOptions(
      [
        stoTx(),
        stoTx({
          action: "BuyToClose",
          rawAction: "Buy to Close",
          amount: -1,
          tradeDate: "2026-01-08",
        }),
      ],
      emptySeed,
    );
    expect(opens).toEqual([]);
  });

  it("closes an assignment row (no residual open option)", () => {
    const opens = computeOpenOptions(
      [
        stoTx(),
        stoTx({
          action: "Assigned",
          rawAction: "Assigned",
          amount: 0,
          tradeDate: "2026-01-09",
        }),
      ],
      emptySeed,
    );
    expect(opens).toEqual([]);
  });

  it("closes on Expired", () => {
    const opens = computeOpenOptions(
      [
        stoTx(),
        stoTx({
          action: "Expired",
          rawAction: "Expired",
          amount: 0,
          tradeDate: "2026-01-09",
        }),
      ],
      emptySeed,
    );
    expect(opens).toEqual([]);
  });

  it("nets partial closes", () => {
    const opens = computeOpenOptions(
      [
        stoTx({ quantity: 3, amount: 25.02 }),
        stoTx({
          action: "BuyToClose",
          rawAction: "Buy to Close",
          quantity: 1,
          amount: -10,
          tradeDate: "2026-01-06",
        }),
      ],
      emptySeed,
    );
    expect(opens).toHaveLength(1);
    expect(opens[0].quantityOpen).toBe(2);
  });
});
