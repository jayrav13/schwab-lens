import { describe, it, expect } from "vitest";
import { parseOptionSymbol } from "@/lib/schwab/optionSymbol";

describe("parseOptionSymbol", () => {
  it("parses a Schwab call-option symbol", () => {
    expect(parseOptionSymbol("ACME 03/15/2026 100.00 C")).toEqual({
      ticker: "ACME",
      expiry: "2026-03-15",
      strike: 100,
      type: "Call",
    });
  });

  it("parses a Schwab put-option symbol", () => {
    expect(parseOptionSymbol("ACME 12/19/2025 47.50 P")).toEqual({
      ticker: "ACME",
      expiry: "2025-12-19",
      strike: 47.5,
      type: "Put",
    });
  });

  it("returns null for an equity ticker", () => {
    expect(parseOptionSymbol("ACME")).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseOptionSymbol(null)).toBeNull();
  });

  it("returns null for an unrecognized format", () => {
    expect(parseOptionSymbol("ACME WEEKLY 100C")).toBeNull();
  });
});
