import type { CanonicalAction } from "@/lib/brokerage/types";

const DIRECT_MAP: Record<string, CanonicalAction> = {
  "Buy": "BUY",
  "Sell": "SELL",
  "Buy to Open": "BUY_TO_OPEN",
  "Sell to Open": "SELL_TO_OPEN",
  "Buy to Close": "BUY_TO_CLOSE",
  "Sell to Close": "SELL_TO_CLOSE",
  "Assigned": "ASSIGNMENT",
  "Exercised": "EXERCISE",
  "Expired": "EXPIRATION",
  "Qualified Dividend": "DIVIDEND",
  "Cash Dividend": "DIVIDEND",
  "Bank Interest": "INTEREST",
  "Credit Interest": "INTEREST",
  "Margin Interest": "INTEREST",
  "Journal": "JOURNAL",
  "Wire Sent": "TRANSFER_OUT",
  "Wire Received": "TRANSFER_IN",
  "MoneyLink Deposit": "TRANSFER_IN",
  "MoneyLink Withdrawal": "TRANSFER_OUT",
  "Service Fee": "FEE",
  "ADR Fee": "FEE",
  "Misc Cash Entry": "JOURNAL",
};

export function mapSchwabAction(
  rawAction: string,
  amount?: number,
): CanonicalAction {
  const direct = DIRECT_MAP[rawAction];
  if (direct) return direct;

  if (/^MoneyLink/.test(rawAction) || /Transfer/i.test(rawAction)) {
    if (amount === undefined || amount >= 0) return "TRANSFER_IN";
    return "TRANSFER_OUT";
  }

  return "UNKNOWN";
}
