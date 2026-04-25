import { describe, it, expect } from "vitest";
import { buildSeedFromSnapshot, chooseSeed } from "@/lib/positions/seed";
import type { PositionsSnapshot } from "@/lib/positions/types";
import type { Config } from "@/lib/model/types";
import type { Transaction } from "@/lib/csv/types";

const snap: PositionsSnapshot = {
  asOf: "2026-03-10T09:00",
  cash: 10000,
  totalValue: 15000,
  shares: [
    { ticker: "ACME", quantity: 100, price: 50, marketValue: 5000, costBasis: 48 },
  ],
  options: [
    {
      underlying: "ACME",
      expiry: "2026-04-17",
      strike: 55,
      callPut: "C",
      quantity: -1,
      price: 1.2,
      marketValue: -120,
      delta: 0.35,
      theta: -0.02,
      intrinsicValue: -5,
    },
  ],
  sourceFile: "positions-basic.csv",
};

describe("buildSeedFromSnapshot", () => {
  it("uses the snapshot's date (YYYY-MM-DD) as seed.asOf", () => {
    const seed = buildSeedFromSnapshot(snap);
    expect(seed.asOf).toBe("2026-03-10");
  });

  it("uses snapshot.cash as seed.cash", () => {
    expect(buildSeedFromSnapshot(snap).cash).toBe(10000);
  });

  it("maps shares with positive quantity to initialShares", () => {
    const seed = buildSeedFromSnapshot(snap);
    expect(seed.initialShares).toEqual([
      { ticker: "ACME", shares: 100, costBasis: 48 },
    ]);
  });

  it("maps short option contracts to initialOptions (quantityOpen as absolute value)", () => {
    const seed = buildSeedFromSnapshot(snap);
    expect(seed.initialOptions).toHaveLength(1);
    const opt = seed.initialOptions[0];
    expect(opt.contract).toEqual({
      ticker: "ACME",
      expiry: "2026-04-17",
      strike: 55,
      type: "Call",
    });
    expect(opt.quantityOpen).toBe(1);
    expect(opt.netPremiumCollected).toBe(0);
  });

  it("synthesizes a single opening entry dated the snapshot's asOf so the UI invariant (non-empty entries) holds", () => {
    const seed = buildSeedFromSnapshot(snap);
    expect(seed.initialOptions[0].entries).toEqual([
      { date: "2026-03-10", price: 1.2, qty: 1 },
    ]);
  });

  it("skips long options (not the wheel strategy's concern)", () => {
    const withLong: PositionsSnapshot = {
      ...snap,
      options: [
        { ...snap.options[0], quantity: 1 },
      ],
    };
    expect(buildSeedFromSnapshot(withLong).initialOptions).toEqual([]);
  });
});

describe("chooseSeed", () => {
  const config: Config = {
    seedDate: "2026-01-15",
    seedValue: 12345,
    marketData: { enabled: true },
  };

  function tx(date: string): Transaction {
    return {
      tradeDate: date,
      action: "Unknown",
      rawAction: "",
      quantity: 0,
      fees: 0,
      amount: 0,
      raw: {
        Date: date,
        Action: "",
        Symbol: "",
        Description: "",
        Quantity: "",
        Price: "",
        "Fees & Comm": "",
        Amount: "",
      },
    };
  }

  const earlySnap: PositionsSnapshot = {
    ...snap,
    asOf: "2025-12-15T09:00",
  };

  const lateSnap: PositionsSnapshot = {
    ...snap,
    asOf: "2026-04-23T09:00",
  };

  it("uses the snapshot as seed when it pre-dates every transaction", () => {
    const seed = chooseSeed({
      transactions: [tx("2026-01-05"), tx("2026-04-20")],
      earliestSnapshot: earlySnap,
      config,
    });
    expect(seed.asOf).toBe("2025-12-15");
    expect(seed.cash).toBe(earlySnap.cash);
  });

  it("falls back to the config seed when the earliest snapshot post-dates any transaction", () => {
    const seed = chooseSeed({
      transactions: [tx("2026-01-05"), tx("2026-04-20")],
      earliestSnapshot: lateSnap,
      config,
    });
    expect(seed.asOf).toBe("2026-01-15");
    expect(seed.cash).toBe(12345);
  });

  it("uses the config seed when no snapshot is available", () => {
    const seed = chooseSeed({
      transactions: [tx("2026-01-05")],
      earliestSnapshot: null,
      config,
    });
    expect(seed.asOf).toBe("2026-01-15");
  });

  it("uses the snapshot seed when there are no transactions", () => {
    const seed = chooseSeed({
      transactions: [],
      earliestSnapshot: lateSnap,
      config,
    });
    expect(seed.asOf).toBe("2026-04-23");
  });
});
