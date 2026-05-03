import type { Transaction } from "@/lib/csv/types";
import { classifyAction } from "@/lib/model/metrics/cashflow";
import type { CashPoint, FlowPoint, Seed } from "@/lib/model/types";

export function computeCashLedger(
  txs: Transaction[],
  seed: Seed,
): {
  cashLedger: CashPoint[];
  externalFlows: FlowPoint[];
  cumulativeExternal: number;
  finalCash: number;
} {
  const sorted = [...txs].sort((a, b) =>
    a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0,
  );

  const cashLedger: CashPoint[] = [
    { date: seed.asOf, balance: seed.cash },
  ];
  const externalFlows: FlowPoint[] = [];
  let balance = seed.cash;
  let cumulativeExternal = 0;

  let dayGroup: string | null = null;

  for (const t of sorted) {
    balance += t.amount;
    if (classifyAction(t.action) === "external") {
      externalFlows.push({ date: t.tradeDate, signedAmount: t.amount });
      cumulativeExternal += t.amount;
    }
    if (dayGroup !== t.tradeDate) {
      cashLedger.push({ date: t.tradeDate, balance });
      dayGroup = t.tradeDate;
    } else {
      cashLedger[cashLedger.length - 1] = {
        date: t.tradeDate,
        balance,
      };
    }
  }

  return {
    cashLedger,
    externalFlows,
    cumulativeExternal,
    finalCash: balance,
  };
}
