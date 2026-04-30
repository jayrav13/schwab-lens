import { describe, it, expect } from "vitest";
import {
  parsePeriodKey,
  resolvePeriod,
} from "@/lib/server/period";

describe("resolvePeriod", () => {
  const today = "2026-04-29";
  const seed = "2024-06-15";

  it("YTD starts on Jan 1 of current year", () => {
    expect(resolvePeriod("YTD", today, seed)).toEqual({
      key: "YTD",
      start: "2026-01-01",
      end: "2026-04-29",
      clampedToSeed: false,
    });
  });

  it("1M is 1 calendar month back", () => {
    expect(resolvePeriod("1M", today, seed)).toMatchObject({
      start: "2026-03-29",
      end: "2026-04-29",
      clampedToSeed: false,
    });
  });

  it("3M is 3 calendar months back", () => {
    expect(resolvePeriod("3M", today, seed)).toMatchObject({
      start: "2026-01-29",
      end: "2026-04-29",
    });
  });

  it("1Y is 1 calendar year back", () => {
    expect(resolvePeriod("1Y", today, seed)).toMatchObject({
      start: "2025-04-29",
      end: "2026-04-29",
    });
  });

  it("All starts at the seed date", () => {
    expect(resolvePeriod("All", today, seed)).toEqual({
      key: "All",
      start: "2024-06-15",
      end: "2026-04-29",
      clampedToSeed: false,
    });
  });

  it("clamps start to seed when computed start is before seed", () => {
    const result = resolvePeriod("1Y", "2025-01-01", "2024-09-01");
    expect(result.start).toBe("2024-09-01");
    expect(result.clampedToSeed).toBe(true);
  });
});

describe("parsePeriodKey", () => {
  it("returns YTD for invalid input", () => {
    expect(parsePeriodKey("garbage")).toBe("YTD");
    expect(parsePeriodKey(undefined)).toBe("YTD");
  });

  it("passes through valid keys", () => {
    expect(parsePeriodKey("1M")).toBe("1M");
    expect(parsePeriodKey("3M")).toBe("3M");
    expect(parsePeriodKey("YTD")).toBe("YTD");
    expect(parsePeriodKey("1Y")).toBe("1Y");
    expect(parsePeriodKey("All")).toBe("All");
  });
});
