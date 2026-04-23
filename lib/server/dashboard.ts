import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadTransactionsFromDir } from "@/lib/csv/load";
import { loadPositionsFromDir, latest, earliest } from "@/lib/positions/load";
import { chooseSeed } from "@/lib/positions/seed";
import { buildPortfolio } from "@/lib/model/portfolio";
import { readConfigFile } from "@/lib/config";
import { fetchQuotes, type Quote } from "@/lib/market/quotes";
import {
  computeMarkToMarket,
  type MarkToMarket,
} from "@/lib/model/metrics/mark_to_market";
import type { PortfolioState } from "@/lib/model/types";
import type { PositionsSnapshot } from "@/lib/positions/types";

export type DashboardData =
  | {
      kind: "ready";
      state: PortfolioState;
      sourceFiles: { transactions: string[]; positions: string[] };
      loadedAt: string;
      markToMarket: MarkToMarket | null;
      latestSnapshot: PositionsSnapshot | null;
    }
  | { kind: "no-csv"; dataDir: string }
  | { kind: "no-config"; dataDir: string }
  | { kind: "parse-error"; message: string };

export async function loadDashboard(): Promise<DashboardData> {
  const dataDir = path.join(process.cwd(), "data");
  const config = readConfigFile(dataDir);
  if (!config) return { kind: "no-config", dataDir };

  const transactionsDir = path.join(dataDir, "transactions");
  const positionsDir = path.join(dataDir, "positions");

  try {
    const transactions = loadTransactionsFromDir(transactionsDir);
    const snapshots = loadPositionsFromDir(positionsDir);

    if (transactions.length === 0 && snapshots.length === 0) {
      return { kind: "no-csv", dataDir };
    }

    const earliestSnap = earliest(snapshots);
    const latestSnap = latest(snapshots);
    const seed = chooseSeed({
      transactions,
      earliestSnapshot: earliestSnap,
      config,
    });

    const state = buildPortfolio(transactions, config, seed);

    let markToMarket: MarkToMarket | null = null;
    if (
      config.marketData.enabled &&
      (state.openSharePositions.length > 0 || latestSnap !== null)
    ) {
      const snapSymbols = new Set(
        (latestSnap?.shares ?? []).map((s) => s.ticker),
      );
      const missing = state.openSharePositions
        .map((s) => s.ticker)
        .filter((t) => !snapSymbols.has(t));

      const quoteMap: Record<string, Quote | null> = {};
      if (missing.length > 0) {
        const results = await fetchQuotes(missing);
        for (const r of results) {
          if (r.kind === "ok") quoteMap[r.quote.ticker] = r.quote;
        }
        for (const t of missing) if (!(t in quoteMap)) quoteMap[t] = null;
      }
      markToMarket = computeMarkToMarket(
        state,
        quoteMap,
        latestSnap ?? undefined,
      );
    }

    return {
      kind: "ready",
      state,
      sourceFiles: {
        transactions: listCsvFiles(transactionsDir),
        positions: snapshots.map((s) => s.sourceFile),
      },
      loadedAt: new Date().toISOString(),
      markToMarket,
      latestSnapshot: latestSnap,
    };
  } catch (err) {
    return {
      kind: "parse-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function listCsvFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort();
}
