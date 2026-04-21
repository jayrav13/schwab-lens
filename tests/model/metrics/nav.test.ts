import { describe, it, expect } from "vitest";
import { computeNavSeries } from "@/lib/model/metrics/nav";
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

describe("computeNavSeries", () => {
  it("starts at seed value on seed date", () => {
    const series = computeNavSeries([], {
      seedDate: "2026-01-15",
      seedValue: 12345,
      marketData: { enabled: false },
    });
    expect(series).toEqual([{ date: "2026-01-15", nav: 12345 }]);
  });

  it("adds realized cash flows", () => {
    const series = computeNavSeries(
      [tx({ amount: 100, tradeDate: "2026-01-05" })],
      { seedDate: "2026-01-15", seedValue: 12345, marketData: { enabled: false } },
    );
    expect(series.at(-1)).toEqual({ date: "2026-01-05", nav: 25100 });
  });

  it("treats put-assignment cash/shares as NAV-neutral", () => {
    const series = computeNavSeries(
      [
        tx({
          action: "Buy",
          rawAction: "Buy",
          ticker: "HL",
          quantity: 200,
          price: 28,
          amount: -5600,
          tradeDate: "2026-01-30",
        }),
      ],
      { seedDate: "2026-01-15", seedValue: 12345, marketData: { enabled: false } },
    );
    expect(series.at(-1)?.nav).toBeCloseTo(12345, 2);
  });
});
