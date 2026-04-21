import { describe, it, expect } from "vitest";
import { parseTradeDate } from "@/lib/util/dates";

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
