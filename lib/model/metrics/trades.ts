import type { OptionLeg, Transaction } from "@/lib/csv/types";

export type TradeOutcome =
  | "Expired"
  | "ClosedProfit"
  | "ClosedLoss"
  | "Assigned";

export type ClosedTrade = {
  contract: OptionLeg;
  openDate: string;
  openPrice: number;
  closeDate: string;
  closePrice: number;
  qty: number;
  outcome: TradeOutcome;
  daysHeld: number;
  netPnL: number;
};

export function computeClosedTrades(
  _transactions: Transaction[],
): ClosedTrade[] {
  return [];
}
