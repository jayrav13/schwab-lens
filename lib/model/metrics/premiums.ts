import type { Transaction } from "@/lib/csv/types";
import type { PremiumPoint } from "@/lib/model/types";

function isPremium(t: Transaction): boolean {
  return t.action === "SellToOpen" || t.action === "BuyToClose";
}

export function computePremiumSeries(txs: Transaction[]): PremiumPoint[] {
  const byDate = new Map<string, number>();
  for (const t of txs) {
    if (!isPremium(t)) continue;
    byDate.set(t.tradeDate, (byDate.get(t.tradeDate) ?? 0) + t.amount);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, netAmount]) => ({ date, netAmount }));
}

export function computePremiumTotals(txs: Transaction[]): {
  gross: number;
  closed: number;
  net: number;
} {
  let gross = 0;
  let closed = 0;
  for (const t of txs) {
    if (t.action === "SellToOpen") gross += t.amount;
    if (t.action === "BuyToClose") closed += -t.amount;
  }
  return { gross, closed, net: gross - closed };
}

export function groupPremiumsByMonth(
  txs: Transaction[],
): { month: string; gross: number; closed: number; net: number }[] {
  const months = new Map<
    string,
    { gross: number; closed: number }
  >();
  for (const t of txs) {
    if (!isPremium(t)) continue;
    const key = t.tradeDate.slice(0, 7);
    const m = months.get(key) ?? { gross: 0, closed: 0 };
    if (t.action === "SellToOpen") m.gross += t.amount;
    else m.closed += -t.amount;
    months.set(key, m);
  }
  return [...months.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, { gross, closed }]) => ({
      month,
      gross,
      closed,
      net: gross - closed,
    }));
}

export type TickerPremium = {
  ticker: string;
  gross: number;
  closed: number;
  net: number;
  assignmentCount: number;
};

export function groupPremiumsByTicker(txs: Transaction[]): TickerPremium[] {
  const by = new Map<string, TickerPremium>();
  for (const t of txs) {
    const ticker = t.option?.ticker;
    if (!ticker) continue;
    const row =
      by.get(ticker) ??
      { ticker, gross: 0, closed: 0, net: 0, assignmentCount: 0 };
    if (t.action === "SellToOpen") row.gross += t.amount;
    else if (t.action === "BuyToClose") row.closed += -t.amount;
    else if (t.action === "Assigned") row.assignmentCount += t.quantity;
    by.set(ticker, row);
  }
  for (const row of by.values()) row.net = row.gross - row.closed;
  return [...by.values()].sort((a, b) => b.net - a.net);
}
