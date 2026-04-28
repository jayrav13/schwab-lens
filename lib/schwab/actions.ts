import type { CanonicalAction } from "@/lib/schwab/types";

const STATIC_MAP: Record<string, CanonicalAction> = {
  Buy: "BUY",
  Sell: "SELL",
  "Buy to Open": "BUY_TO_OPEN",
  "Sell to Open": "SELL_TO_OPEN",
  "Buy to Close": "BUY_TO_CLOSE",
  "Sell to Close": "SELL_TO_CLOSE",
  Assigned: "ASSIGNMENT",
  Exercised: "EXERCISE",
  Expired: "EXPIRATION",
  "Qualified Dividend": "DIVIDEND",
  "Bank Interest": "INTEREST",
  "Credit Interest": "INTEREST",
  Journal: "JOURNAL",
  "MoneyLink Deposit": "TRANSFER_IN",
  "Wire Sent": "TRANSFER_OUT",
  Fee: "FEE",
};

export function canonicalize(actionRaw: string, amount?: number): CanonicalAction {
  if (actionRaw === "MoneyLink Transfer") {
    if (amount === undefined) return "UNKNOWN";
    return amount >= 0 ? "TRANSFER_IN" : "TRANSFER_OUT";
  }
  return STATIC_MAP[actionRaw] ?? "UNKNOWN";
}
