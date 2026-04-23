import { describe, it, expect } from "vitest";
import { filterSeriesByRange } from "@/lib/model/chart";
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
