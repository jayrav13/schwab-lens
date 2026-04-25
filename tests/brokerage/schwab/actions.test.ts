import { describe, it, expect } from "vitest";
import { mapSchwabAction } from "@/lib/brokerage/schwab/actions";

describe("mapSchwabAction", () => {
  it("maps known direct actions", () => {
    expect(mapSchwabAction("Buy")).toBe("BUY");
    expect(mapSchwabAction("Sell")).toBe("SELL");
    expect(mapSchwabAction("Buy to Open")).toBe("BUY_TO_OPEN");
    expect(mapSchwabAction("Sell to Open")).toBe("SELL_TO_OPEN");
    expect(mapSchwabAction("Buy to Close")).toBe("BUY_TO_CLOSE");
    expect(mapSchwabAction("Sell to Close")).toBe("SELL_TO_CLOSE");
    expect(mapSchwabAction("Assigned")).toBe("ASSIGNMENT");
    expect(mapSchwabAction("Exercised")).toBe("EXERCISE");
    expect(mapSchwabAction("Expired")).toBe("EXPIRATION");
    expect(mapSchwabAction("Qualified Dividend")).toBe("DIVIDEND");
    expect(mapSchwabAction("Bank Interest")).toBe("INTEREST");
    expect(mapSchwabAction("Credit Interest")).toBe("INTEREST");
    expect(mapSchwabAction("Journal")).toBe("JOURNAL");
    expect(mapSchwabAction("Wire Sent")).toBe("TRANSFER_OUT");
    expect(mapSchwabAction("Service Fee")).toBe("FEE");
    expect(mapSchwabAction("MoneyLink Deposit")).toBe("TRANSFER_IN");
  });

  it("uses sign-based fallback for ambiguous transfers", () => {
    expect(mapSchwabAction("MoneyLink Transfer", 100)).toBe("TRANSFER_IN");
    expect(mapSchwabAction("MoneyLink Transfer", -100)).toBe("TRANSFER_OUT");
    expect(mapSchwabAction("MoneyLink Transfer", 0)).toBe("TRANSFER_IN");
  });

  it("returns UNKNOWN for unmapped actions", () => {
    expect(mapSchwabAction("Some Future Action")).toBe("UNKNOWN");
    expect(mapSchwabAction("")).toBe("UNKNOWN");
  });
});
