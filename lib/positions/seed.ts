import type { OpenOption, Seed } from "@/lib/model/types";
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
