export type CanonicalAction =
  | "BUY"
  | "SELL"
  | "BUY_TO_OPEN"
  | "SELL_TO_OPEN"
  | "BUY_TO_CLOSE"
  | "SELL_TO_CLOSE"
  | "ASSIGNMENT"
  | "EXERCISE"
  | "EXPIRATION"
  | "DIVIDEND"
  | "INTEREST"
  | "FEE"
  | "JOURNAL"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "UNKNOWN";

export interface AccountIdentity {
  externalId: string;
  label: string;
}

export interface CanonicalTransaction {
  tradeDate: string;
  actionCanonical: CanonicalAction;
  actionRaw: string;
  symbol: string | null;
  description: string | null;
  quantity: number | null;
  price: number | null;
  fees: number | null;
  amount: number;
  raw: Record<string, unknown>;
}

export type AssetType = "equity" | "option" | "cash" | null;

export interface CanonicalPositionSnapshot {
  asOf: string;
  symbol: string;
  description: string | null;
  quantity: number | null;
  price: number | null;
  marketValue: number | null;
  costBasis: number | null;
  assetType: AssetType;
  raw: Record<string, unknown>;
}
