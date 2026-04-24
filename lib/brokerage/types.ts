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

export const ALL_CANONICAL_ACTIONS: ReadonlyArray<CanonicalAction> = [
  "BUY",
  "SELL",
  "BUY_TO_OPEN",
  "SELL_TO_OPEN",
  "BUY_TO_CLOSE",
  "SELL_TO_CLOSE",
  "ASSIGNMENT",
  "EXERCISE",
  "EXPIRATION",
  "DIVIDEND",
  "INTEREST",
  "FEE",
  "JOURNAL",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "UNKNOWN",
] as const;

export type AssetType = "equity" | "option" | "cash";

export type ParseInput = {
  filepath: string;
  content: string;
};

export type CanonicalTransaction = {
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
};

export type CanonicalPositionSnapshot = {
  asOf: string;
  symbol: string;
  description: string | null;
  quantity: number | null;
  price: number | null;
  marketValue: number | null;
  costBasis: number | null;
  assetType: AssetType | null;
  raw: Record<string, unknown>;
};

export type AccountIdentity = {
  externalId: string;
  label: string;
};

export interface Brokerage {
  slug: string;
  displayName: string;
  filenamePatterns: {
    transactions: RegExp[];
    positions: RegExp[];
  };
  identify(input: ParseInput): AccountIdentity;
  parseTransactions(input: ParseInput): CanonicalTransaction[];
  parsePositions(input: ParseInput): CanonicalPositionSnapshot[];
}
