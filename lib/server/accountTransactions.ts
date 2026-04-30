import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";
import { type Account, getAccountByUuid } from "@/lib/db/repos/accounts";
import { listTransactionsByAccount } from "@/lib/db/repos/transactions";
import { transactionFromRow } from "@/lib/model/fromDb";
import type { Transaction } from "@/lib/csv/types";

export type AccountTransactionsView = {
  account: Account;
  transactions: Transaction[];
};

export interface LoadAccountTransactionsViewOpts {
  db?: Database.Database;
}

export async function loadAccountTransactionsView(
  uuid: string,
  opts: LoadAccountTransactionsViewOpts = {},
): Promise<AccountTransactionsView | null> {
  const db = opts.db ?? getDb();
  const account = getAccountByUuid(db, uuid);
  if (!account) return null;

  const rows = listTransactionsByAccount(db, account.id);
  const transactions = rows
    .map(transactionFromRow)
    .sort((a, b) =>
      a.tradeDate < b.tradeDate ? 1 : a.tradeDate > b.tradeDate ? -1 : 0,
    );

  return { account, transactions };
}
