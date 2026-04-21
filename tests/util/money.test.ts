import { describe, it, expect } from "vitest";
import { parseCurrency, formatCurrency } from "@/lib/util/money";

describe("parseCurrency", () => {
  it("parses a plain dollar amount", () => {
    expect(parseCurrency("$39.34")).toBe(39.34);
  });

  it("parses a negative amount", () => {
    expect(parseCurrency("-$53.66")).toBe(-53.66);
  });

  it("parses amounts with embedded commas", () => {
    expect(parseCurrency("$1,234.56")).toBe(1234.56);
  });

  it("returns 0 for empty string", () => {
    expect(parseCurrency("")).toBe(0);
  });

  it("returns 0 for undefined-like input", () => {
    expect(parseCurrency(undefined)).toBe(0);
  });

  it("parses fractional-cent prices like SGOV fills", () => {
    expect(parseCurrency("$100.3733")).toBeCloseTo(100.3733, 4);
  });
});

describe("formatCurrency", () => {
  it("formats positive dollars with two decimals and thousands separators", () => {
    expect(formatCurrency(28609.85)).toBe("$28,609.85");
  });

  it("formats negatives with a leading minus", () => {
    expect(formatCurrency(-53.66)).toBe("-$53.66");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });
});
