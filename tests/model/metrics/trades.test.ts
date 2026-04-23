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

  it("produces an Expired row with closePrice=0 and full premium as P&L", () => {
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

  it("produces an Assigned row with closePrice=0", () => {
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
    const trades = computeClosedTrades([
      sto("2026-03-10", O, 3, 1.0, 0.6),
      btc("2026-03-20", O, 1, 0.1, 0.1),
      btc("2026-04-01", O, 2, 0.05, 0.1),
    ]);
    expect(trades).toHaveLength(2);

    expect(trades[0].netPnL).toBeCloseTo(90 - 0.2 - 0.1);
    expect(trades[1].netPnL).toBeCloseTo(190 - 0.4 - 0.1);
  });

  it("silently skips orphan closes (close event with no open lot)", () => {
    const trades = computeClosedTrades([btc("2026-04-01", O, 1, 0.1)]);
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
