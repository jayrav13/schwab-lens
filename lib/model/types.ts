import type { OptionLeg, Transaction } from "@/lib/csv/types";
import type { ClosedTrade } from "@/lib/model/metrics/trades";

export type Config = {
  seedDate: string;
  seedValue: number;
  marketData: { enabled: boolean };
  benchmark?: string | null;
};

export type CashPoint = { date: string; balance: number };
export type FlowPoint = { date: string; signedAmount: number };
export type NavPoint = { date: string; nav: number };
export type PremiumPoint = { date: string; netAmount: number };

export type OpenOption = {
  contract: OptionLeg;
  quantityOpen: number;
  netPremiumCollected: number;
  entries: { date: string; price: number; qty: number }[];
};

export type OpenShare = {
  ticker: string;
  shares: number;
  weightedCostBasis: number;
};

export type Warning =
  | { kind: "UnknownAction"; rawAction: string; count: number }
  | { kind: "CashDrift"; expected: number; actual: number }
  | { kind: "NegativeShareEndOfDay"; ticker: string; date: string; shares: number }
  | { kind: "UnpairedAssignment"; date: string; contractKey: string }
  | { kind: "MissingHistoricalPrices"; ticker: string; reason: string }
  | { kind: "MissingSeed" };

export type PortfolioState = {
  config: Config;
  transactions: Transaction[];
  cashLedger: CashPoint[];
  externalFlows: FlowPoint[];
  navSeries: NavPoint[];
  portfolioValueSeries?: NavPoint[];
  benchmarkSeries?: NavPoint[];
  benchmarkTicker?: string;
  openOptionPositions: OpenOption[];
  openSharePositions: OpenShare[];
  premiumSeries: PremiumPoint[];
  premiumTotals: { gross: number; closed: number; net: number };
  closedTrades?: ClosedTrade[];
  warnings: Warning[];
};

export type { Seed } from "@/lib/positions/types";
export type { ClosedTrade, TradeOutcome } from "@/lib/model/metrics/trades";
