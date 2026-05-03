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

describe("computeTwr — seed backfill", () => {
  it("uses seed as effective start when from <= seedDate", () => {
    // seed: 2025-12-01 = 9000
    // snapshots: 2026-02-01 = 10000, 2026-04-01 = 11000
    // No flows.
    // Sub-period 1: 9000 -> 10000 = (10000 - 9000)/9000 = 0.1111...
    // Sub-period 2: 10000 -> 11000 = 0.1
    // TWR = 1.1111 * 1.1 - 1 = 0.2222...

    const navPoints: NavPoint[] = [
      { date: "2026-02-01", nav: 10000 },
      { date: "2026-04-01", nav: 11000 },
    ];

    const result = computeTwr({
      navPoints,
      transactions: [],
      period: { from: "2025-11-01", to: "2026-04-01" },
      seed: { date: "2025-12-01", value: 9000 },
    });

    expect(result.twr).not.toBeNull();
    expect(result.twr!).toBeCloseTo(0.22222, 4);
    expect(result.clamped).toBe(false);
    expect(result.effectiveStart).toEqual({ date: "2025-12-01", nav: 9000 });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].fromDate).toBe("2025-12-01");
    expect(result.segments[0].fromNav).toBe(9000);
  });

  it("ignores seed when from > seedDate (period starts after seed)", () => {
    const navPoints: NavPoint[] = [
      { date: "2026-02-01", nav: 10000 },
      { date: "2026-04-01", nav: 11000 },
    ];
    const result = computeTwr({
      navPoints,
      transactions: [],
      period: { from: "2026-01-15", to: "2026-04-01" },
      seed: { date: "2025-12-01", value: 9000 },
    });

    // Seed not used because requested from (2026-01-15) > seedDate (2025-12-01).
    expect(result.effectiveStart?.date).toBe("2026-02-01");
    expect(result.effectiveStart?.nav).toBe(10000);
  });
});

describe("computeTwr — clamping", () => {
  it("sets clamped=true when from is before any snapshot and no seed", () => {
    const navPoints: NavPoint[] = [
      { date: "2026-02-01", nav: 10000 },
      { date: "2026-04-01", nav: 11000 },
    ];
    const result = computeTwr({
      navPoints,
      transactions: [],
      period: { from: "2025-01-01", to: "2026-04-01" },
      seed: null,
    });

    expect(result.clamped).toBe(true);
    expect(result.effectiveStart?.date).toBe("2026-02-01");
    expect(result.warnings).toContainEqual({
      kind: "Clamped",
      earliestDate: "2026-02-01",
    });
  });

  it("does not clamp when from <= seedDate and seed is set", () => {
    const navPoints: NavPoint[] = [
      { date: "2026-02-01", nav: 10000 },
      { date: "2026-04-01", nav: 11000 },
    ];
    const result = computeTwr({
      navPoints,
      transactions: [],
      period: { from: "2025-01-01", to: "2026-04-01" },
      seed: { date: "2025-12-01", value: 9000 },
    });

    expect(result.clamped).toBe(false);
    expect(result.warnings.find((w) => w.kind === "Clamped")).toBeUndefined();
  });
});

describe("computeTwr — degenerate periods", () => {
  it("returns null TWR with InsufficientSnapshots when period has one snapshot", () => {
    const navPoints: NavPoint[] = [{ date: "2026-02-01", nav: 10000 }];
    const result = computeTwr({
      navPoints,
      transactions: [],
      period: { from: "2026-01-01", to: "2026-04-01" },
      seed: null,
    });

    expect(result.twr).toBeNull();
    expect(result.warnings).toContainEqual({
      kind: "InsufficientSnapshots",
      count: 1,
    });
  });

  it("returns null TWR with no warnings when period has zero snapshots and no seed", () => {
    const result = computeTwr({
      navPoints: [],
      transactions: [],
      period: { from: "2026-01-01", to: "2026-04-01" },
      seed: null,
    });

    expect(result.twr).toBeNull();
    expect(result.effectiveStart).toBeNull();
    expect(result.effectiveEnd).toBeNull();
  });

  it("skips the first sub-period when effective_start_nav = 0", () => {
    // Account opened with first transfer creating the first snapshot at 0.
    // 2026-01-01 NAV=0 (account opened, no funds yet)
    // 2026-02-01 deposit +10000 (external)
    // 2026-03-01 NAV=10500
    // 2026-04-01 NAV=11000
    //
    // First sub-period [01-01, 03-01] has start NAV 0 — skip it.
    // Chain begins at first non-zero snapshot (2026-03-01 = 10500).
    // Sub-period 1: 10500 -> 11000 (no flows in 03-01 to 04-01)
    //   r = 500 / 10500 ≈ 0.04762
    // TWR = 0.04762

    const navPoints: NavPoint[] = [
      { date: "2026-01-01", nav: 0 },
      { date: "2026-03-01", nav: 10500 },
      { date: "2026-04-01", nav: 11000 },
    ];

    const result = computeTwr({
      navPoints,
      transactions: [
        tx({
          tradeDate: "2026-02-01",
          action: "Journal",
          rawAction: "MoneyLink Deposit",
          amount: 10000,
        }),
      ],
      period: { from: "2026-01-01", to: "2026-04-01" },
      seed: null,
    });

    expect(result.twr).not.toBeNull();
    expect(result.twr!).toBeCloseTo(0.04762, 4);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].fromDate).toBe("2026-03-01");
  });
});

describe("computeTwr — negative interior NAV", () => {
  it("returns null TWR + NegativeNav warning when interior denom is non-positive", () => {
    // Pathological: short option went deep ITM, snapshot NAV briefly negative.
    const navPoints: NavPoint[] = [
      { date: "2026-01-01", nav: 10000 },
      { date: "2026-02-01", nav: -500 },
      { date: "2026-03-01", nav: 11000 },
    ];

    const result = computeTwr({
      navPoints,
      transactions: [],
      period: { from: "2026-01-01", to: "2026-03-01" },
      seed: null,
    });

    expect(result.twr).toBeNull();
    expect(result.warnings).toContainEqual({
      kind: "NegativeNav",
      date: "2026-02-01",
      nav: -500,
    });
  });
});

describe("computeTwr — unknown actions in period", () => {
  it("emits one UnknownActionInPeriod warning per unknown tx in the effective window", () => {
    const navPoints: NavPoint[] = [
      { date: "2026-01-01", nav: 10000 },
      { date: "2026-04-01", nav: 11000 },
    ];

    const result = computeTwr({
      navPoints,
      transactions: [
        tx({
          tradeDate: "2026-02-01",
          action: "Unknown",
          rawAction: "Misc Cash Entry",
          amount: 50,
        }),
        tx({
          tradeDate: "2026-03-15",
          action: "Unknown",
          rawAction: "Service Fee",
          amount: -2,
        }),
        tx({
          tradeDate: "2025-12-31",
          action: "Unknown",
          rawAction: "Older",
          amount: 1,
        }),
      ],
      period: { from: "2026-01-01", to: "2026-04-01" },
      seed: null,
    });

    const unknowns = result.warnings.filter(
      (w) => w.kind === "UnknownActionInPeriod",
    );
    expect(unknowns).toHaveLength(2);
    expect(unknowns[0]).toMatchObject({
      kind: "UnknownActionInPeriod",
      date: "2026-02-01",
      rawAction: "Misc Cash Entry",
      amount: 50,
    });
    expect(unknowns[1]).toMatchObject({
      kind: "UnknownActionInPeriod",
      date: "2026-03-15",
      rawAction: "Service Fee",
      amount: -2,
    });
  });
});

describe("computeTwr — Modified Dietz cross-check", () => {
  it("matches a textbook Modified Dietz hand-computation within 1e-4", () => {
    // Reference fixture: Investopedia-style Modified Dietz example.
    // Period: 90 days, [2026-01-01, 2026-04-01]
    // Beginning value: $100,000 (snapshot 2026-01-01)
    // Ending value:    $112,000 (snapshot 2026-04-01)
    // External cash flows during period:
    //   2026-01-31 deposit +$5,000 (day 30 of 90)
    //   2026-03-02 withdraw -$3,000 (day 60 of 90)
    //
    // Modified Dietz over the WHOLE period (single sub-period since there's
    // no interior snapshot):
    //   net_flows = 5000 - 3000 = 2000
    //   weighted = 5000 * (90 - 30)/90 + (-3000) * (90 - 60)/90
    //            = 5000 * 60/90 + (-3000) * 30/90
    //            = 3333.333 + (-1000)
    //            = 2333.333
    //   r = (112000 - 100000 - 2000) / (100000 + 2333.333)
    //     = 10000 / 102333.333
    //     ≈ 0.0977199
    //
    // computeTwr produces a chain of one segment (no interior snapshots),
    // so its TWR equals the Modified Dietz number.

    const navPoints: NavPoint[] = [
      { date: "2026-01-01", nav: 100000 },
      { date: "2026-04-01", nav: 112000 },
    ];

    const transactions: Transaction[] = [
      tx({
        tradeDate: "2026-01-31",
        action: "Journal",
        rawAction: "MoneyLink Deposit",
        amount: 5000,
      }),
      tx({
        tradeDate: "2026-03-02",
        action: "WireSent",
        rawAction: "Wire Sent",
        amount: -3000,
      }),
    ];

    const result = computeTwr({
      navPoints,
      transactions,
      period: { from: "2026-01-01", to: "2026-04-01" },
      seed: null,
    });

    const dietz = 10000 / (100000 + 2333.333333);
    expect(result.twr).not.toBeNull();
    expect(result.twr!).toBeCloseTo(dietz, 4);
    expect(result.twr!).toBeCloseTo(0.0977199, 4);
  });
});
