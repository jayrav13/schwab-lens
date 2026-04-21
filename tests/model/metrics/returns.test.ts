import { describe, it, expect } from "vitest";
import { computeReturnMetrics } from "@/lib/model/metrics/returns";

describe("computeReturnMetrics", () => {
  const config = { seedDate: "2026-01-15", seedValue: 10000 };

  it("computes total and annualized return with zero external flows", () => {
    const r = computeReturnMetrics(
      [
        { date: "2026-01-15", nav: 10000 },
        { date: "2026-04-01", nav: 10500 },
      ],
      [],
      config,
    );
    expect(r.totalReturnPct).toBeCloseTo(0.05, 4);
    expect(r.daysSinceSeed).toBe(90);
    expect(r.annualizedPct).toBeCloseTo(0.05 * (365 / 90), 3);
  });

  it("excludes external flows from return %", () => {
    const r = computeReturnMetrics(
      [
        { date: "2026-01-15", nav: 10000 },
        { date: "2026-02-01", nav: 15000 },
      ],
      [{ date: "2026-01-15", signedAmount: 5000 }],
      config,
    );
    // NAV up $5000, but $5000 was external → real gain 0
    expect(r.totalReturnPct).toBeCloseTo(0, 4);
  });

  it("picks best and worst months", () => {
    const r = computeReturnMetrics(
      [
        { date: "2026-01-15", nav: 10000 },
        { date: "2026-01-31", nav: 10500 }, // Jan +5%
        { date: "2026-02-28", nav: 10300 }, // Feb −1.9%
        { date: "2026-03-31", nav: 11000 }, // Mar +6.8%
      ],
      [],
      config,
    );
    expect(r.bestMonth?.month).toBe("2026-03");
    expect(r.worstMonth?.month).toBe("2026-02");
  });
});
