import { describe, it, expect } from "vitest";
import { computeCashYield } from "@/lib/model/metrics/cash_yield";
import type { Transaction } from "@/lib/csv/types";

function tx(over: Partial<Transaction>): Transaction {
  return {
    tradeDate: "2026-01-05",
    action: "QualifiedDividend",
    rawAction: "Qualified Dividend",
    quantity: 0,
    fees: 0,
    amount: 0,
    raw: {} as Transaction["raw"],
    ...over,
  };
}

describe("computeCashYield", () => {
  it("sums each ancillary bucket correctly", () => {
    const y = computeCashYield([
      tx({ action: "QualifiedDividend", amount: 2.0 }),
      tx({ action: "BankInterest", amount: 0.25 }),
      tx({ action: "CreditInterest", amount: 0.1 }),
      tx({ action: "ServiceFee", amount: -15 }),
      tx({ action: "MiscCashEntry", amount: 15 }),
      tx({ action: "Journal", amount: 500 }),
      tx({ action: "WireSent", amount: -500 }),
    ]);
    expect(y.dividends).toBe(2.0);
    expect(y.bankInterest).toBe(0.25);
    expect(y.creditInterest).toBe(0.1);
    expect(y.fees).toBe(-15);
    expect(y.miscCashEntries).toBe(15);
    expect(y.netJournals).toBe(0);
    expect(y.totalAncillary).toBeCloseTo(2.35, 2);
  });
});
