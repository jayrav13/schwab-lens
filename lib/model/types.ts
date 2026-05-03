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
  | { kind: "MissingSeed" }
  | { kind: "Clamped"; earliestDate: string }
  | { kind: "NegativeNav"; date: string; nav: number }
  | { kind: "UnknownActionInPeriod"; date: string; rawAction: string; amount: number }
  | { kind: "InsufficientSnapshots"; count: number };

export type TwrFlow = {
  date: string;
  amount: number;
  weight: number;
};

export type TwrSegment = {
  fromDate: string;
  toDate: string;
  fromNav: number;
  toNav: number;
  flows: TwrFlow[];
  flowsTotal: number;
  weightedFlows: number;
  return: number;
};

export type TwrResult = {
  twr: number | null;
  effectiveStart: { date: string; nav: number } | null;
  effectiveEnd: { date: string; nav: number } | null;
  clamped: boolean;
  segments: TwrSegment[];
  warnings: Warning[];
};

export type BenchmarkResult = {
  twr: number;
  ticker: string;
  fromDate: string;
  fromClose: number;
  toDate: string;
  toClose: number;
};

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
