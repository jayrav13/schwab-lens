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
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
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

    const closePrice = t.action === "BuyToClose" ? t.price ?? 0 : 0;
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
