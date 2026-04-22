import type { Transaction } from "@/lib/csv/types";
import type { NavPoint, Seed } from "@/lib/model/types";

export function computeNavSeries(
  txs: Transaction[],
  seed: Seed,
): NavPoint[] {
  const sorted = [...txs].sort((a, b) =>
    a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0,
  );

  const shares = new Map<string, { qty: number; cost: number }>();
  for (const s of seed.initialShares) {
    shares.set(s.ticker, {
      qty: s.shares,
      cost: s.shares * s.costBasis,
    });
  }
  let cash = seed.cash;

  let initialSharesValue = 0;
  for (const s of shares.values()) {
    if (s.qty > 0) initialSharesValue += s.cost;
  }
  const series: NavPoint[] = [
    { date: seed.asOf, nav: cash + initialSharesValue },
  ];
  let currentDate: string | null = null;

  for (const t of sorted) {
    cash += t.amount;
    if ((t.action === "Buy" || t.action === "Sell") && t.ticker) {
      const s = shares.get(t.ticker) ?? { qty: 0, cost: 0 };
      const price = t.price ?? 0;
      if (t.action === "Buy") {
        s.qty += t.quantity;
        s.cost += t.quantity * price;
      } else {
        if (s.qty > 0) {
          const avg = s.cost / s.qty;
          s.cost -= t.quantity * avg;
        }
        s.qty -= t.quantity;
      }
      shares.set(t.ticker, s);
    }

    let sharesValue = 0;
    for (const s of shares.values()) {
      if (s.qty <= 0) continue;
      const avg = s.qty !== 0 ? s.cost / s.qty : 0;
      sharesValue += s.qty * avg;
    }
    const nav = cash + sharesValue;

    if (currentDate !== t.tradeDate) {
      series.push({ date: t.tradeDate, nav });
      currentDate = t.tradeDate;
    } else {
      series[series.length - 1] = { date: t.tradeDate, nav };
    }
  }

  return series;
}
