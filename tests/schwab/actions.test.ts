import { describe, it, expect } from "vitest";
import { canonicalize } from "@/lib/schwab/actions";

describe("canonicalize action", () => {
  it.each([
    ["Buy", "BUY"],
    ["Sell", "SELL"],
    ["Buy to Open", "BUY_TO_OPEN"],
    ["Sell to Open", "SELL_TO_OPEN"],
    ["Buy to Close", "BUY_TO_CLOSE"],
    ["Sell to Close", "SELL_TO_CLOSE"],
    ["Assigned", "ASSIGNMENT"],
    ["Exercised", "EXERCISE"],
    ["Expired", "EXPIRATION"],
    ["Qualified Dividend", "DIVIDEND"],
    ["Bank Interest", "INTEREST"],
    ["Credit Interest", "INTEREST"],
    ["Journal", "JOURNAL"],
    ["MoneyLink Deposit", "TRANSFER_IN"],
    ["Wire Sent", "TRANSFER_OUT"],
    ["Fee", "FEE"],
  ] as const)("maps %s -> %s", (raw, expected) => {
    expect(canonicalize(raw)).toBe(expected);
  });

  it("returns UNKNOWN for unmapped actions", () => {
    expect(canonicalize("Some Mystery Action")).toBe("UNKNOWN");
  });

  it("handles MoneyLink Transfer based on amount sign", () => {
    expect(canonicalize("MoneyLink Transfer", 100)).toBe("TRANSFER_IN");
    expect(canonicalize("MoneyLink Transfer", -100)).toBe("TRANSFER_OUT");
  });
});
