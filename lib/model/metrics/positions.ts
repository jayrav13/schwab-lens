import type { Transaction, OptionLeg } from "@/lib/csv/types";
import type { OpenOption, OpenShare, Seed, Warning } from "@/lib/model/types";

export function computeShareLedger(
  txs: Transaction[],
  seed: Seed,
): {
  openShares: OpenShare[];
  warnings: Warning[];
} {
  const state = new Map<string, { shares: number; cost: number }>();
  for (const s of seed.initialShares) {
    state.set(s.ticker, {
      shares: s.shares,
      cost: s.shares * s.costBasis,
    });
  }
  const warnings: Warning[] = [];

  const sorted = [...txs].sort((a, b) =>
    a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0,
  );

  for (const t of sorted) {
    if ((t.action !== "Buy" && t.action !== "Sell") || !t.ticker) continue;
    const s = state.get(t.ticker) ?? { shares: 0, cost: 0 };
    const price = t.price ?? 0;
    if (t.action === "Buy") {
      s.shares += t.quantity;
      s.cost += t.quantity * price;
    } else {
      if (s.shares > 0) {
        const avg = s.cost / s.shares;
        s.cost -= t.quantity * avg;
      }
      s.shares -= t.quantity;
    }
    state.set(t.ticker, s);
  }

  const running = new Map<string, number>();
  for (const s of seed.initialShares) {
    running.set(s.ticker, s.shares);
  }
  const perDate = new Map<string, Map<string, number>>();
  for (const t of sorted) {
    if ((t.action !== "Buy" && t.action !== "Sell") || !t.ticker) continue;
    const day = perDate.get(t.tradeDate) ?? new Map<string, number>();
    const delta = t.action === "Buy" ? t.quantity : -t.quantity;
    day.set(t.ticker, (day.get(t.ticker) ?? 0) + delta);
    perDate.set(t.tradeDate, day);
  }

  for (const [date, deltas] of [...perDate.entries()].sort()) {
    for (const [ticker, delta] of deltas) {
      const next = (running.get(ticker) ?? 0) + delta;
      running.set(ticker, next);
      if (next < 0) {
        warnings.push({
          kind: "NegativeShareEndOfDay",
          ticker,
          date,
          shares: next,
        });
      }
    }
  }

  const openShares: OpenShare[] = [];
  for (const [ticker, s] of state) {
    if (Math.abs(s.shares) < 0.5) continue;
    const avg = s.shares !== 0 ? s.cost / s.shares : 0;
    openShares.push({
      ticker,
      shares: Math.round(s.shares),
      weightedCostBasis: avg,
    });
  }
  openShares.sort((a, b) => a.ticker.localeCompare(b.ticker));

  return { openShares, warnings };
}

function contractKey(o: OptionLeg): string {
  return `${o.ticker}|${o.expiry}|${o.strike}|${o.type}`;
}

export function computeOpenOptions(
  txs: Transaction[],
  seed: Seed,
): OpenOption[] {
  const byKey = new Map<
    string,
    {
      contract: OptionLeg;
      quantityOpen: number;
      netPremiumCollected: number;
      entries: OpenOption["entries"];
    }
  >();

  for (const o of seed.initialOptions) {
    byKey.set(contractKey(o.contract), {
      contract: o.contract,
      quantityOpen: o.quantityOpen,
      netPremiumCollected: o.netPremiumCollected,
      entries: [...o.entries],
    });
  }

  const sorted = [...txs].sort((a, b) =>
    a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0,
  );

  for (const t of sorted) {
    if (!t.option) continue;
    const key = contractKey(t.option);
    const s =
      byKey.get(key) ?? {
        contract: t.option,
        quantityOpen: 0,
        netPremiumCollected: 0,
        entries: [] as OpenOption["entries"],
      };
    if (t.action === "SellToOpen") {
      s.quantityOpen += t.quantity;
      s.netPremiumCollected += t.amount;
      s.entries.push({
        date: t.tradeDate,
        price: t.price ?? 0,
        qty: t.quantity,
      });
    } else if (
      t.action === "BuyToClose" ||
      t.action === "Expired" ||
      t.action === "Assigned"
    ) {
      s.quantityOpen -= t.quantity;
      if (t.action === "BuyToClose") {
        s.netPremiumCollected += t.amount;
      }
    }
    byKey.set(key, s);
  }

  const open: OpenOption[] = [];
  for (const s of byKey.values()) {
    if (s.quantityOpen > 0) open.push(s);
  }
  open.sort((a, b) => a.contract.expiry.localeCompare(b.contract.expiry));
  return open;
}
