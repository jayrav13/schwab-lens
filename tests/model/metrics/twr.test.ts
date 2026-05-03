import { describe, it, expect } from "vitest";
import { computeTwr } from "@/lib/model/metrics/twr";
import type { Transaction } from "@/lib/csv/types";
import type { NavPoint } from "@/lib/model/types";

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    tradeDate: "2026-01-05",
    action: "Buy",
    rawAction: "Buy",
    quantity: 1,
    fees: 0,
    amount: 0,
    raw: {} as Transaction["raw"],
    ...overrides,
  };
}

describe("computeTwr — happy path", () => {
  it("computes TWR with one mid-period external deposit", () => {
    // Period: [2026-01-01, 2026-04-01]
    // Snapshots: 2026-01-01 NAV=10000, 2026-03-01 NAV=11500, 2026-04-01 NAV=13500
    // Flow: 2026-02-15 deposit +1000 (external)
    //
    // Sub-period 1: [2026-01-01, 2026-03-01]
    //   N0=10000, N1=11500, days = 59, flow on day 45 (2026-02-15 from 2026-01-01)
    //   weight = (59 - 45) / 59 = 14/59
    //   weighted_flows = 1000 * 14/59
    //   r1 = (11500 - 10000 - 1000) / (10000 + 1000*14/59)
    //      = 500 / (10000 + 237.288...) ≈ 0.0488824
    //
    // Sub-period 2: [2026-03-01, 2026-04-01]
    //   N1=11500, N2=13500, no flows
    //   r2 = (13500 - 11500) / 11500 = 0.1739130...
    //
    // TWR = (1.0488824 * 1.1739130) - 1 ≈ 0.231283

    const navPoints: NavPoint[] = [
      { date: "2026-01-01", nav: 10000 },
      { date: "2026-03-01", nav: 11500 },
      { date: "2026-04-01", nav: 13500 },
    ];

    const transactions: Transaction[] = [
      tx({
        tradeDate: "2026-02-15",
        action: "Journal",
        rawAction: "MoneyLink Deposit",
        amount: 1000,
      }),
    ];

    const result = computeTwr({
      navPoints,
      transactions,
      period: { from: "2026-01-01", to: "2026-04-01" },
      seed: null,
    });

    expect(result.twr).not.toBeNull();
    expect(result.twr!).toBeCloseTo(0.231283, 4);
    expect(result.clamped).toBe(false);
    expect(result.segments).toHaveLength(2);
    expect(result.warnings).toEqual([]);
    expect(result.effectiveStart).toEqual({ date: "2026-01-01", nav: 10000 });
    expect(result.effectiveEnd).toEqual({ date: "2026-04-01", nav: 13500 });

    // First sub-period detail
    const seg1 = result.segments[0];
    expect(seg1.fromDate).toBe("2026-01-01");
    expect(seg1.toDate).toBe("2026-03-01");
    expect(seg1.flows).toHaveLength(1);
    expect(seg1.flows[0].date).toBe("2026-02-15");
    expect(seg1.flows[0].amount).toBe(1000);
    expect(seg1.flows[0].weight).toBeCloseTo(14 / 59, 5);
    expect(seg1.flowsTotal).toBe(1000);
    expect(seg1.weightedFlows).toBeCloseTo((1000 * 14) / 59, 3);
    expect(seg1.return).toBeCloseTo(0.04888, 4);

    // Second sub-period detail
    const seg2 = result.segments[1];
    expect(seg2.fromDate).toBe("2026-03-01");
    expect(seg2.toDate).toBe("2026-04-01");
    expect(seg2.flows).toEqual([]);
    expect(seg2.return).toBeCloseTo(0.17391, 4);
  });
});
