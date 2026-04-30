import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";
import { type Account, getAccountByUuid } from "@/lib/db/repos/accounts";
import { listTransactionsByAccount } from "@/lib/db/repos/transactions";
import { transactionFromRow } from "@/lib/model/fromDb";
import { computeClosedTrades } from "@/lib/model/metrics/trades";
import type { ClosedTrade } from "@/lib/model/types";

export type AccountTradesView = {
  account: Account;
  closedTrades: ClosedTrade[];
};

export interface LoadAccountTradesViewOpts {
  db?: Database.Database;
}

export async function loadAccountTradesView(
  uuid: string,
  opts: LoadAccountTradesViewOpts = {},
): Promise<AccountTradesView | null> {
  const db = opts.db ?? getDb();
  const account = getAccountByUuid(db, uuid);
  if (!account) return null;

  const rows = listTransactionsByAccount(db, account.id);
  const transactions = rows.map(transactionFromRow);
  const closedTrades = computeClosedTrades(transactions);

  return { account, closedTrades };
}
