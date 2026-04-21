import type { Transaction } from "@/lib/csv/types";
import type { CashPoint, Config, FlowPoint } from "@/lib/model/types";

export function computeCashLedger(
  txs: Transaction[],
  config: Config,
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
    { date: config.seedDate, balance: config.seedValue },
  ];
  const externalFlows: FlowPoint[] = [];
  let balance = config.seedValue;
  let cumulativeExternal = 0;

  let dayGroup: string | null = null;

  for (const t of sorted) {
    balance += t.amount;
    if (t.action === "Journal" || t.action === "WireSent") {
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
