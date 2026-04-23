import type { Transaction } from "@/lib/csv/types";
import type {
  Config,
  PortfolioState,
  Seed,
  Warning,
} from "@/lib/model/types";
import { computeCashLedger } from "@/lib/model/cash";
import {
  computeOpenOptions,
  computeShareLedger,
} from "@/lib/model/metrics/positions";
import { computeNavSeries } from "@/lib/model/metrics/nav";
import {
  computePremiumSeries,
  computePremiumTotals,
} from "@/lib/model/metrics/premiums";
import { computeClosedTrades } from "@/lib/model/metrics/trades";

const CASH_DRIFT_TOLERANCE = 0.01;

export function seedFromConfig(config: Config): Seed {
  return {
    asOf: config.seedDate,
    cash: config.seedValue,
    initialShares: [],
    initialOptions: [],
  };
}

export function buildPortfolio(
  transactions: Transaction[],
  config: Config,
  seed: Seed,
): PortfolioState {
  const warnings: Warning[] = [];

  const txs = transactions.filter((t) => t.tradeDate >= seed.asOf);

  const cash = computeCashLedger(txs, seed);

  const expected = seed.cash + txs.reduce((acc, t) => acc + t.amount, 0);
  if (Math.abs(expected - cash.finalCash) > CASH_DRIFT_TOLERANCE) {
    warnings.push({
      kind: "CashDrift",
      expected,
      actual: cash.finalCash,
    });
  }

  const { openShares, warnings: shareWarnings } = computeShareLedger(txs, seed);
  warnings.push(...shareWarnings);
  const openOptions = computeOpenOptions(txs, seed);

  const navSeries = computeNavSeries(txs, seed);

  const premiumSeries = computePremiumSeries(txs);
  const premiumTotals = computePremiumTotals(txs);
  const closedTrades = computeClosedTrades(txs);

  const unknownCounts = new Map<string, number>();
  for (const t of txs) {
    if (t.action === "Unknown") {
      unknownCounts.set(t.rawAction, (unknownCounts.get(t.rawAction) ?? 0) + 1);
    }
  }
  for (const [rawAction, count] of unknownCounts) {
    warnings.push({ kind: "UnknownAction", rawAction, count });
  }

  for (const t of txs) {
    if (t.action !== "Assigned" || !t.option) continue;
    const paired = txs.find(
      (o) =>
        o.tradeDate === t.tradeDate &&
        o.ticker === t.option!.ticker &&
        (o.action === "Buy" || o.action === "Sell") &&
        o.quantity === t.quantity * 100,
    );
    if (!paired) {
      warnings.push({
        kind: "UnpairedAssignment",
        date: t.tradeDate,
        contractKey: `${t.option.ticker}|${t.option.expiry}|${t.option.strike}|${t.option.type}`,
      });
    }
  }

  return {
    config,
    transactions: txs,
    cashLedger: cash.cashLedger,
    externalFlows: cash.externalFlows,
    navSeries,
    openOptionPositions: openOptions,
    openSharePositions: openShares,
    premiumSeries,
    premiumTotals,
    closedTrades,
    warnings,
  };
}
