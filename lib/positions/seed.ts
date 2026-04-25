import type { Config, OpenOption, Seed } from "@/lib/model/types";
import type { Transaction } from "@/lib/csv/types";
import type { PositionsSnapshot } from "@/lib/positions/types";

export function buildSeedFromSnapshot(snap: PositionsSnapshot): Seed {
  const date = snap.asOf.slice(0, 10);

  const initialShares = snap.shares
    .filter((s) => s.quantity > 0)
    .map((s) => ({
      ticker: s.ticker,
      shares: s.quantity,
      costBasis: s.costBasis,
    }));

  const initialOptions: OpenOption[] = snap.options
    .filter((o) => o.quantity < 0)
    .map((o) => {
      const qty = Math.abs(o.quantity);
      return {
        contract: {
          ticker: o.underlying,
          expiry: o.expiry,
          strike: o.strike,
          type: o.callPut === "C" ? "Call" : "Put",
        },
        quantityOpen: qty,
        netPremiumCollected: 0,
        entries: [{ date, price: o.price, qty }],
      };
    });

  return {
    asOf: date,
    cash: snap.cash,
    initialShares,
    initialOptions,
  };
}

export function chooseSeed(opts: {
  transactions: Transaction[];
  earliestSnapshot: PositionsSnapshot | null;
  config: Config;
}): Seed {
  const { transactions, earliestSnapshot, config } = opts;

  const configSeed: Seed = {
    asOf: config.seedDate,
    cash: config.seedValue,
    initialShares: [],
    initialOptions: [],
  };

  if (earliestSnapshot === null) return configSeed;

  const snapDate = earliestSnapshot.asOf.slice(0, 10);
  const earliestTxDate = transactions
    .map((t) => t.tradeDate)
    .sort()[0];

  // Snapshot can only seed the portfolio if it pre-dates every transaction;
  // otherwise transactions would get filtered out as "before the seed".
  if (earliestTxDate === undefined || earliestTxDate >= snapDate) {
    return buildSeedFromSnapshot(earliestSnapshot);
  }
  return configSeed;
}
