import { describe, it, expect } from "vitest";
import { buildPortfolio, seedFromConfig } from "@/lib/model/portfolio";
import type { Transaction } from "@/lib/csv/types";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    tradeDate: "2026-01-05",
    action: "SellToOpen",
    rawAction: "Sell to Open",
    quantity: 1,
    fees: 0,
    amount: 0,
    raw: {} as Transaction["raw"],
    ...overrides,
  };
}

describe("buildPortfolio", () => {
  const config = { seedDate: "2026-01-15", seedValue: 12345, marketData: { enabled: false } };
  const seed = seedFromConfig(config);

  it("produces a seed-only state from no transactions", () => {
    const s = buildPortfolio([], config, seed);
    expect(s.cashLedger).toEqual([
      { date: "2026-01-15", balance: 12345 },
    ]);
    expect(s.navSeries).toEqual([{ date: "2026-01-15", nav: 12345 }]);
    expect(s.premiumTotals).toEqual({ gross: 0, closed: 0, net: 0 });
    expect(s.openOptionPositions).toEqual([]);
    expect(s.openSharePositions).toEqual([]);
  });

  it("computes return% when external flows net to zero", () => {
    const s = buildPortfolio(
      [
        tx({ amount: 5000, action: "Journal", rawAction: "Journal" }),
        tx({
          amount: -5000,
          action: "WireSent",
          rawAction: "Wire Sent",
          tradeDate: "2026-02-05",
        }),
        tx({ amount: 100, tradeDate: "2026-02-10" }),
      ],
      config,
      seed,
    );
    expect(s.navSeries.at(-1)!.nav).toBeCloseTo(25100, 2);
  });

  it("raises UnknownAction warning with count", () => {
    const s = buildPortfolio(
      [
        tx({ action: "Unknown", rawAction: "Merger Adjustment", amount: 123 }),
        tx({ action: "Unknown", rawAction: "Merger Adjustment", amount: 45 }),
      ],
      config,
      seed,
    );
    const w = s.warnings.find((w) => w.kind === "UnknownAction");
    expect(w).toBeDefined();
    if (w?.kind === "UnknownAction") {
      expect(w.count).toBe(2);
      expect(w.rawAction).toBe("Merger Adjustment");
    }
  });

  it("raises UnpairedAssignment warning", () => {
    const s = buildPortfolio(
      [
        tx({
          action: "Assigned",
          rawAction: "Assigned",
          option: {
            ticker: "XYZ",
            expiry: "2026-01-30",
            strike: 10,
            type: "Put",
          },
          amount: 0,
          quantity: 1,
          tradeDate: "2026-01-30",
        }),
      ],
      config,
      seed,
    );
    expect(
      s.warnings.some((w) => w.kind === "UnpairedAssignment"),
    ).toBe(true);
  });

  it("drops transactions that predate the seed date", () => {
    const s = buildPortfolio(
      [
        tx({ amount: 99999, tradeDate: "2025-12-31" }),
        tx({ amount: 100, tradeDate: "2026-01-05" }),
      ],
      config,
      seed,
    );
    expect(s.cashLedger.at(-1)?.balance).toBe(25100);
  });
});
