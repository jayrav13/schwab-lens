import { describe, it, expect } from "vitest";
import { computeBenchmark } from "@/lib/model/metrics/benchmark";

const closes = [
  { date: "2026-01-02", close: 500 },
  { date: "2026-01-03", close: 505 },
  { date: "2026-02-15", close: 520 },
  { date: "2026-03-30", close: 540 },
  { date: "2026-04-01", close: 545 },
];

describe("computeBenchmark", () => {
  it("computes buy-and-hold TWR between snapped endpoints", () => {
    const result = computeBenchmark({
      ticker: "SPY",
      closes,
      fromDate: "2026-01-02",
      toDate: "2026-04-01",
    });

    expect(result).not.toBeNull();
    expect(result!.ticker).toBe("SPY");
    expect(result!.fromDate).toBe("2026-01-02");
    expect(result!.fromClose).toBe(500);
    expect(result!.toDate).toBe("2026-04-01");
    expect(result!.toClose).toBe(545);
    expect(result!.twr).toBeCloseTo((545 - 500) / 500, 6);
  });

  it("snaps endpoints to closest trading day on or before each requested date", () => {
    const result = computeBenchmark({
      ticker: "SPY",
      closes,
      fromDate: "2026-01-01", // weekend
      toDate: "2026-04-15", // after last close
    });

    expect(result).not.toBeNull();
    expect(result!.fromDate).toBe("2026-01-02"); // first close on or after from
    expect(result!.toDate).toBe("2026-04-01"); // last close on or before to
  });

  it("snaps fromDate forward to the first close >= fromDate when none on or before", () => {
    const result = computeBenchmark({
      ticker: "SPY",
      closes,
      fromDate: "2025-12-01",
      toDate: "2026-04-01",
    });
    expect(result).not.toBeNull();
    expect(result!.fromDate).toBe("2026-01-02");
  });

  it("returns null when no close falls inside [fromDate, toDate]", () => {
    const result = computeBenchmark({
      ticker: "SPY",
      closes,
      fromDate: "2027-01-01",
      toDate: "2027-12-31",
    });
    expect(result).toBeNull();
  });

  it("returns null when fromClose is 0 or non-finite", () => {
    const result = computeBenchmark({
      ticker: "SPY",
      closes: [
        { date: "2026-01-02", close: 0 },
        { date: "2026-04-01", close: 545 },
      ],
      fromDate: "2026-01-02",
      toDate: "2026-04-01",
    });
    expect(result).toBeNull();
  });

  it("returns null when fewer than 2 closes are in the window", () => {
    const result = computeBenchmark({
      ticker: "SPY",
      closes: [{ date: "2026-02-15", close: 500 }],
      fromDate: "2026-01-01",
      toDate: "2026-04-01",
    });
    expect(result).toBeNull();
  });
});
