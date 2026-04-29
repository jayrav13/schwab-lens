import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";
import {
  type Account,
  getAccountByUuid,
} from "@/lib/db/repos/accounts";
import { listTransactionsByAccount } from "@/lib/db/repos/transactions";
import {
  getEarliestSnapshotDate,
  getLatestSnapshotDate,
  getSnapshotByDate,
} from "@/lib/db/repos/positionSnapshots";
import { getBoolean } from "@/lib/db/repos/settings";
import {
  positionsSnapshotFromRows,
  transactionFromRow,
} from "@/lib/model/fromDb";
import { buildPortfolio } from "@/lib/model/portfolio";
import { chooseSeed } from "@/lib/positions/seed";
import type { Config, PortfolioState } from "@/lib/model/types";
import type { PositionsSnapshot } from "@/lib/positions/types";

export type AccountOptionsView =
  | {
      kind: "ready";
      account: Account;
      state: PortfolioState;
      sourceFiles: { transactions: string[]; positions: string[] };
      loadedAt: string;
      latestSnapshot: PositionsSnapshot | null;
    }
  | { kind: "no-data"; account: Account };

export interface LoadAccountOptionsViewOpts {
  db?: Database.Database;
}

export async function loadAccountOptionsView(
  uuid: string,
  opts: LoadAccountOptionsViewOpts = {},
): Promise<AccountOptionsView | null> {
  const db = opts.db ?? getDb();

  const account = getAccountByUuid(db, uuid);
  if (!account) return null;

  const txRows = listTransactionsByAccount(db, account.id);
  const transactions = txRows.map(transactionFromRow);

  const earliestSnapDate = getEarliestSnapshotDate(db, account.id);
  const latestSnapDate = getLatestSnapshotDate(db, account.id);
  const earliestSnapshot = earliestSnapDate
    ? positionsSnapshotFromRows(
        earliestSnapDate,
        getSnapshotByDate(db, account.id, earliestSnapDate),
      )
    : null;
  const latestSnapshot = latestSnapDate
    ? positionsSnapshotFromRows(
        latestSnapDate,
        getSnapshotByDate(db, account.id, latestSnapDate),
      )
    : null;

  if (transactions.length === 0 && earliestSnapshot === null) {
    return { kind: "no-data", account };
  }

  const marketDataEnabled = getBoolean(db, "market_data.enabled");
  const config: Config = {
    seedDate: account.seedDate ?? earliestSnapshot?.asOf ?? "",
    seedValue: account.seedValue ?? earliestSnapshot?.totalValue ?? 0,
    marketData: { enabled: marketDataEnabled },
    benchmark: account.benchmark,
  };

  const seed = chooseSeed({
    transactions,
    earliestSnapshot,
    config,
  });

  const state = buildPortfolio(transactions, config, seed);

  const txSourceFiles = Array.from(
    new Set(txRows.map((r) => r.source_file)),
  ).sort();
  const posSourceFiles = Array.from(
    new Set(
      [earliestSnapshot?.sourceFile, latestSnapshot?.sourceFile].filter(
        (s): s is string => Boolean(s),
      ),
    ),
  ).sort();

  return {
    kind: "ready",
    account,
    state,
    sourceFiles: { transactions: txSourceFiles, positions: posSourceFiles },
    loadedAt: new Date().toISOString(),
    latestSnapshot,
  };
}
