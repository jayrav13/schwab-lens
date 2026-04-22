import { describe, it, expect } from "vitest";
import { buildSeedFromSnapshot } from "@/lib/positions/seed";
import type { PositionsSnapshot } from "@/lib/positions/types";

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
    expect(opt.entries).toEqual([]);
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
