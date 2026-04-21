export type Action =
  | "SellToOpen"
  | "BuyToClose"
  | "Expired"
  | "Assigned"
  | "Buy"
  | "Sell"
  | "QualifiedDividend"
  | "BankInterest"
  | "CreditInterest"
  | "Journal"
  | "WireSent"
  | "MiscCashEntry"
  | "ServiceFee"
  | "Unknown";

export type OptionLeg = {
  ticker: string;
  expiry: string;
  strike: number;
  type: "Put" | "Call";
};

export type RawCsvRow = {
  Date: string;
  Action: string;
  Symbol: string;
  Description: string;
  Quantity: string;
  Price: string;
  "Fees & Comm": string;
  Amount: string;
};

export type Transaction = {
  tradeDate: string;
  action: Action;
  ticker?: string;
  option?: OptionLeg;
  quantity: number;
  price?: number;
  fees: number;
  amount: number;
  raw: RawCsvRow;
  rawAction: string;
};
