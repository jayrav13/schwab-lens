import { describe, it, expect } from "vitest";
import { parseOptionSymbol } from "@/lib/util/optionSymbol";

describe("parseOptionSymbol", () => {
  it("parses a put", () => {
    expect(parseOptionSymbol("FAKE 01/09/2026 10.00 P")).toEqual({
      underlying: "FAKE",
      expiry: "2026-01-09",
      strike: 10,
      callPut: "P",
    });
  });

  it("parses a call with multi-letter ticker and decimal in ticker", () => {
    expect(parseOptionSymbol("ABC.D 12/20/2026 100 C")).toEqual({
      underlying: "ABC.D",
      expiry: "2026-12-20",
      strike: 100,
      callPut: "C",
    });
  });

  it("returns null for non-option symbols", () => {
    expect(parseOptionSymbol("FAKE")).toBeNull();
    expect(parseOptionSymbol("not a symbol")).toBeNull();
    expect(parseOptionSymbol("")).toBeNull();
  });
});
