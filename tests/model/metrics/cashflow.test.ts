import { describe, it, expect } from "vitest";
import {
  classifyAction,
  externalFlowsBetween,
  unknownActionsBetween,
  type FlowKind,
} from "@/lib/model/metrics/cashflow";
import type { Action, Transaction } from "@/lib/csv/types";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    tradeDate: "2026-01-05",
    action: "Buy",
    rawAction: "Buy",
    quantity: 1,
    fees: 0,
    amount: 0,
    raw: {} as Transaction["raw"],
    ...overrides,
  };
}

describe("classifyAction", () => {
  const cases: Array<[Action, FlowKind]> = [
    ["Buy", "internal"],
    ["Sell", "internal"],
    ["SellToOpen", "internal"],
    ["BuyToClose", "internal"],
    ["Assigned", "internal"],
    ["Expired", "internal"],
    ["QualifiedDividend", "internal"],
    ["BankInterest", "internal"],
    ["CreditInterest", "internal"],
    ["ServiceFee", "internal"],
    ["MiscCashEntry", "internal"],
    ["Journal", "external"],
    ["WireSent", "external"],
    ["Unknown", "unknown"],
  ];
  for (const [action, kind] of cases) {
    it(`classifies ${action} as ${kind}`, () => {
      expect(classifyAction(action)).toBe(kind);
    });
  }
});

describe("externalFlowsBetween", () => {
  it("returns flows in [from, to] inclusive, sorted by date asc", () => {
    const txs: Transaction[] = [
      tx({ tradeDate: "2026-01-05", action: "Journal", amount: 5000 }),
      tx({ tradeDate: "2026-02-15", action: "WireSent", amount: -2000 }),
      tx({ tradeDate: "2026-01-10", action: "Buy", amount: -500 }),
      tx({ tradeDate: "2025-12-31", action: "Journal", amount: 1000 }),
      tx({ tradeDate: "2026-04-01", action: "Journal", amount: 100 }),
    ];
    const flows = externalFlowsBetween(txs, "2026-01-01", "2026-03-01");
    expect(flows).toEqual([
      { date: "2026-01-05", signedAmount: 5000 },
      { date: "2026-02-15", signedAmount: -2000 },
    ]);
  });

  it("returns an empty array when no flows fall in range", () => {
    const txs: Transaction[] = [
      tx({ tradeDate: "2026-01-05", action: "Buy", amount: -500 }),
    ];
    expect(externalFlowsBetween(txs, "2026-01-01", "2026-03-01")).toEqual([]);
  });
});

describe("unknownActionsBetween", () => {
  it("returns Unknown-action transactions in [from, to] inclusive", () => {
    const txs: Transaction[] = [
      tx({ tradeDate: "2026-01-05", action: "Unknown", rawAction: "Mystery", amount: 100 }),
      tx({ tradeDate: "2026-02-10", action: "Buy", amount: -500 }),
      tx({ tradeDate: "2026-04-01", action: "Unknown", rawAction: "Other", amount: 50 }),
    ];
    const result = unknownActionsBetween(txs, "2026-01-01", "2026-03-01");
    expect(result).toHaveLength(1);
    expect(result[0].rawAction).toBe("Mystery");
  });
});
