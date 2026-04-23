import { describe, it, expect } from "vitest";
import {
  filterSeriesByRange,
  nearestPointByMs,
  computeYRange,
} from "@/lib/model/chart";
import type { NavPoint } from "@/lib/model/types";

const daily: NavPoint[] = [
  { date: "2026-01-15", nav: 100 },
  { date: "2026-02-01", nav: 110 },
  { date: "2026-03-01", nav: 120 },
  { date: "2026-04-01", nav: 130 },
  { date: "2026-04-20", nav: 140 },
];

describe("filterSeriesByRange", () => {
  it("'All' returns input unchanged", () => {
    expect(filterSeriesByRange(daily, "All", "2026-04-20")).toEqual(daily);
  });

  it("empty input returns empty output for every preset", () => {
    for (const preset of ["1M", "3M", "6M", "YTD", "All"] as const) {
      expect(filterSeriesByRange([], preset, "2026-04-20")).toEqual([]);
    }
  });

  it("'1M' keeps points within 30 days of asOfDate", () => {
    // asOf 2026-04-20; window starts 2026-03-21
    const out = filterSeriesByRange(daily, "1M", "2026-04-20");
    expect(out.map((p) => p.date)).toEqual(["2026-04-01", "2026-04-20"]);
  });

  it("'3M' keeps points within 90 days of asOfDate", () => {
    // asOf 2026-04-20; window starts 2026-01-20
    const out = filterSeriesByRange(daily, "3M", "2026-04-20");
    expect(out.map((p) => p.date)).toEqual([
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-04-20",
    ]);
  });

  it("'6M' keeps points within 180 days of asOfDate", () => {
    const out = filterSeriesByRange(daily, "6M", "2026-04-20");
    expect(out.map((p) => p.date)).toEqual([
      "2026-01-15",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-04-20",
    ]);
  });

  it("'YTD' keeps points from Jan 1 of asOfDate's year onward", () => {
    const mixed: NavPoint[] = [
      { date: "2025-11-01", nav: 90 },
      { date: "2025-12-31", nav: 95 },
      { date: "2026-01-15", nav: 100 },
      { date: "2026-04-20", nav: 140 },
    ];
    const out = filterSeriesByRange(mixed, "YTD", "2026-04-20");
    expect(out.map((p) => p.date)).toEqual(["2026-01-15", "2026-04-20"]);
  });

  it("window entirely before series start returns empty", () => {
    const out = filterSeriesByRange(
      [{ date: "2022-01-01", nav: 50 }],
      "1M",
      "2026-04-20",
    );
    expect(out).toEqual([]);
  });

  it("returns a single in-range point as-is (caller handles drawability)", () => {
    const out = filterSeriesByRange(
      [{ date: "2026-04-10", nav: 120 }],
      "1M",
      "2026-04-20",
    );
    expect(out).toEqual([{ date: "2026-04-10", nav: 120 }]);
  });
});

describe("nearestPointByMs", () => {
  const s: NavPoint[] = [
    { date: "2026-01-15", nav: 100 },
    { date: "2026-02-01", nav: 110 },
    { date: "2026-03-01", nav: 120 },
  ];

  it("returns null for an empty series", () => {
    expect(nearestPointByMs([], Date.parse("2026-02-15"))).toBeNull();
  });

  it("returns the first point when target is before the series", () => {
    const out = nearestPointByMs(s, Date.parse("2025-06-01"));
    expect(out?.date).toBe("2026-01-15");
  });

  it("returns the last point when target is after the series", () => {
    const out = nearestPointByMs(s, Date.parse("2027-01-01"));
    expect(out?.date).toBe("2026-03-01");
  });

  it("picks the closer of two adjacent points", () => {
    const out = nearestPointByMs(s, Date.parse("2026-02-05"));
    expect(out?.date).toBe("2026-02-01");
  });

  it("tiebreak: equidistant target picks the earlier point", () => {
    const jan = Date.parse("2026-01-15");
    const feb = Date.parse("2026-02-01");
    const mid = jan + (feb - jan) / 2;
    const out = nearestPointByMs(s, mid);
    expect(out?.date).toBe("2026-01-15");
  });
});

describe("computeYRange", () => {
  it("computes min/max across multi-series with a 10% pad", () => {
    const a: NavPoint[] = [
      { date: "2026-01-15", nav: 100 },
      { date: "2026-02-01", nav: 200 },
    ];
    const b: NavPoint[] = [
      { date: "2026-01-15", nav: 150 },
      { date: "2026-02-01", nav: 180 },
    ];
    const { yMin, yMax } = computeYRange([a, b], 100);
    // raw min = 100, raw max = 200, pad = (200 - 100) * 0.1 = 10
    expect(yMin).toBe(90);
    expect(yMax).toBe(210);
  });

  it("always includes seedValue in the range", () => {
    const a: NavPoint[] = [
      { date: "2026-01-15", nav: 500 },
      { date: "2026-02-01", nav: 600 },
    ];
    const { yMin, yMax } = computeYRange([a], 100);
    expect(yMin).toBeLessThanOrEqual(100);
    expect(yMax).toBeGreaterThanOrEqual(600);
  });

  it("single-series: min/max from that series + seed", () => {
    const a: NavPoint[] = [
      { date: "2026-01-15", nav: 120 },
      { date: "2026-02-01", nav: 150 },
    ];
    const { yMin, yMax } = computeYRange([a], 100);
    // Raw min = 100 (seed), raw max = 150, pad = (150 - 100) * 0.1 = 5
    expect(yMin).toBe(95);
    expect(yMax).toBe(155);
  });

  it("all-empty fallback: [seed * 0.9, seed * 1.1]", () => {
    const { yMin, yMax } = computeYRange([], 10000);
    expect(yMin).toBe(9000);
    expect(yMax).toBe(11000);

    const { yMin: yMin2, yMax: yMax2 } = computeYRange([[], []], 10000);
    expect(yMin2).toBe(9000);
    expect(yMax2).toBe(11000);
  });
});
