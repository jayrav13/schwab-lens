import { describe, it, expect } from "vitest";
import {
  hashTransaction,
  hashSnapshot,
  canonicalJson,
} from "@/lib/ingest/contentHash";
import type {
  CanonicalTransaction,
  CanonicalPositionSnapshot,
} from "@/lib/brokerage/types";

const TX: CanonicalTransaction = {
  tradeDate: "2026-01-02",
  actionCanonical: "SELL_TO_OPEN",
  actionRaw: "Sell to Open",
  symbol: "FAKE 01/09/2026 10.00 P",
  description: "PUT FAKE",
  quantity: 1,
  price: 1,
  fees: 0.66,
  amount: 99.34,
  raw: { z: "last", a: "first" },
};

describe("canonicalJson", () => {
  it("sorts keys deterministically", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("is stable across nested key reordering", () => {
    expect(canonicalJson({ a: { y: 1, x: 2 } })).toBe('{"a":{"x":2,"y":1}}');
  });
});

describe("hashTransaction", () => {
  it("returns the same hash for the same row", () => {
    expect(hashTransaction("schwab", "999", TX)).toBe(hashTransaction("schwab", "999", TX));
  });

  it("differs when amount changes", () => {
    expect(hashTransaction("schwab", "999", TX))
      .not.toBe(hashTransaction("schwab", "999", { ...TX, amount: 100 }));
  });

  it("differs when account changes", () => {
    expect(hashTransaction("schwab", "999", TX))
      .not.toBe(hashTransaction("schwab", "888", TX));
  });

  it("is stable under raw key reordering", () => {
    expect(hashTransaction("schwab", "999", TX))
      .toBe(hashTransaction("schwab", "999", { ...TX, raw: { a: "first", z: "last" } }));
  });
});

describe("hashSnapshot", () => {
  const SNAP: CanonicalPositionSnapshot = {
    asOf: "2026-01-05",
    symbol: "FAKE",
    description: "FAKE INC",
    quantity: 10,
    price: 55,
    marketValue: 550,
    costBasis: 500,
    assetType: "equity",
    raw: { Symbol: "FAKE" },
  };

  it("is deterministic", () => {
    expect(hashSnapshot("schwab", "999", SNAP)).toBe(hashSnapshot("schwab", "999", SNAP));
  });

  it("varies with as_of and symbol", () => {
    expect(hashSnapshot("schwab", "999", SNAP))
      .not.toBe(hashSnapshot("schwab", "999", { ...SNAP, asOf: "2026-01-06" }));
    expect(hashSnapshot("schwab", "999", SNAP))
      .not.toBe(hashSnapshot("schwab", "999", { ...SNAP, symbol: "OTHER" }));
  });
});
