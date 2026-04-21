import type { Transaction } from "@/lib/csv/types";
import type {
  Config,
  PortfolioState,
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

const CASH_DRIFT_TOLERANCE = 0.01;

export function buildPortfolio(
  transactions: Transaction[],
  config: Config,
): PortfolioState {
  const warnings: Warning[] = [];

  const cash = computeCashLedger(transactions, config);

  const expected =
    config.seedValue + transactions.reduce((acc, t) => acc + t.amount, 0);
  if (Math.abs(expected - cash.finalCash) > CASH_DRIFT_TOLERANCE) {
    warnings.push({
      kind: "CashDrift",
      expected,
      actual: cash.finalCash,
    });
  }

  const { openShares, warnings: shareWarnings } =
    computeShareLedger(transactions);
  warnings.push(...shareWarnings);
  const openOptions = computeOpenOptions(transactions);

  const navSeries = computeNavSeries(transactions, config);

  const premiumSeries = computePremiumSeries(transactions);
  const premiumTotals = computePremiumTotals(transactions);

  const unknownCounts = new Map<string, number>();
  for (const t of transactions) {
    if (t.action === "Unknown") {
      unknownCounts.set(t.rawAction, (unknownCounts.get(t.rawAction) ?? 0) + 1);
    }
  }
  for (const [rawAction, count] of unknownCounts) {
    warnings.push({ kind: "UnknownAction", rawAction, count });
  }

  for (const t of transactions) {
    if (t.action !== "Assigned" || !t.option) continue;
    const paired = transactions.find(
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
    transactions,
    cashLedger: cash.cashLedger,
    externalFlows: cash.externalFlows,
    navSeries,
    openOptionPositions: openOptions,
    openSharePositions: openShares,
    premiumSeries,
    premiumTotals,
    warnings,
  };
}
