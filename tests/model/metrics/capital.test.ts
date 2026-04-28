import { describe, it, expect } from "vitest";
import { computeCapitalAtRisk } from "@/lib/model/metrics/capital";
import type { PortfolioState } from "@/lib/model/types";

function baseState(over: Partial<PortfolioState> = {}): PortfolioState {
  return {
    config: { seedDate: "2025-12-31", seedValue: 10000, marketData: { enabled: false } },
    transactions: [],
    cashLedger: [{ date: "2026-02-01", balance: 5000 }],
    externalFlows: [],
    navSeries: [{ date: "2026-02-01", nav: 10000 }],
    openOptionPositions: [],
    openSharePositions: [],
    premiumSeries: [],
    premiumTotals: { gross: 0, closed: 0, net: 0 },
    warnings: [],
    ...over,
  };
}

describe("computeCapitalAtRisk", () => {
  it("sums put collateral only (calls excluded)", () => {
    const v = computeCapitalAtRisk(
      baseState({
        openOptionPositions: [
          {
            contract: {
              ticker: "AAA",
              expiry: "2026-02-06",
              strike: 20,
              type: "Put",
            },
            quantityOpen: 2,
            netPremiumCollected: 50,
            entries: [],
          },
          {
            contract: {
              ticker: "BBB",
              expiry: "2026-02-06",
              strike: 30,
              type: "Call",
            },
            quantityOpen: 1,
            netPremiumCollected: 20,
            entries: [],
          },
        ],
      }),
    );
    expect(v.putCollateral).toBe(20 * 100 * 2); // 4000
    expect(v.sharesAtCost).toBe(0);
  });

  it("adds held shares at cost basis", () => {
    const v = computeCapitalAtRisk(
      baseState({
        openSharePositions: [{ ticker: "ZZZ", shares: 100, weightedCostBasis: 25 }],
      }),
    );
    expect(v.sharesAtCost).toBe(2500);
  });

  it("reports % of NAV deployed and free", () => {
    const v = computeCapitalAtRisk(
      baseState({
        navSeries: [{ date: "2026-02-01", nav: 10000 }],
        openSharePositions: [{ ticker: "ZZZ", shares: 100, weightedCostBasis: 25 }],
      }),
    );
    expect(v.deployedPctOfNav).toBe(0.25);
    expect(v.freePctOfNav).toBe(0.75);
  });
});
