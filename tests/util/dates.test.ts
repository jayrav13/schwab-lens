import { describe, it, expect } from "vitest";
import { effectiveToday, parseTradeDate, yesterdayInET } from "@/lib/util/dates";

describe("parseTradeDate", () => {
  it("parses a simple MM/DD/YYYY date", () => {
    expect(parseTradeDate("04/20/2026")).toBe("2026-04-20");
  });

  it("uses the 'as of' date when present", () => {
    expect(parseTradeDate("04/20/2026 as of 04/17/2026")).toBe("2026-04-17");
  });

  it("pads single-digit months and days", () => {
    expect(parseTradeDate("1/5/2026")).toBe("2026-01-05");
  });

  it("throws on unparseable input", () => {
    expect(() => parseTradeDate("not a date")).toThrow();
  });

  it("throws on empty input", () => {
    expect(() => parseTradeDate("")).toThrow();
  });
});

describe("yesterdayInET", () => {
  it("returns the previous ET calendar day as YYYY-MM-DD", () => {
    const noonET = new Date("2026-04-23T16:00:00Z");
    expect(yesterdayInET(noonET)).toBe("2026-04-22");
  });

  it("handles the ET/UTC boundary correctly", () => {
    const earlyUTC = new Date("2026-04-23T03:00:00Z");
    expect(yesterdayInET(earlyUTC)).toBe("2026-04-21");
  });
});

describe("effectiveToday", () => {
  const noonET = new Date("2026-04-23T16:00:00Z");

  it("returns yesterdayInET when no snapshot exists", () => {
    expect(effectiveToday(null, noonET)).toBe("2026-04-22");
  });

  it("returns yesterdayInET when the latest snapshot is older", () => {
    expect(effectiveToday("2026-04-21", noonET)).toBe("2026-04-22");
  });

  it("returns yesterdayInET when the latest snapshot equals yesterday", () => {
    expect(effectiveToday("2026-04-22", noonET)).toBe("2026-04-22");
  });

  it("returns the snapshot date when it is past yesterday", () => {
    expect(effectiveToday("2026-04-23", noonET)).toBe("2026-04-23");
  });
});
