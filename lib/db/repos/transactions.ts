import type Database from "better-sqlite3";
import { contentHash } from "@/lib/db/contentHash";
import type { CanonicalTransaction } from "@/lib/schwab/types";

export interface TransactionRow {
  id: number;
  account_id: number;
  trade_date: string;
  action_canonical: string;
  action_raw: string;
  symbol: string | null;
  description: string | null;
  quantity: number | null;
  price: number | null;
  fees: number | null;
  amount: number;
  raw: string;
  source_file: string;
  content_hash: string;
}

export function insertTransaction(
  db: Database.Database,
  accountId: number,
  tx: CanonicalTransaction,
  sourceFile: string,
): { inserted: boolean } {
  const externalIdRow = db
    .prepare("SELECT external_id FROM accounts WHERE id = ?")
    .get(accountId) as { external_id: string };
  const hash = contentHash({
    external_id: externalIdRow.external_id,
    trade_date: tx.tradeDate,
    action_canonical: tx.actionCanonical,
    action_raw: tx.actionRaw,
    symbol: tx.symbol,
    description: tx.description,
    quantity: tx.quantity,
    price: tx.price,
    fees: tx.fees,
    amount: tx.amount,
  });
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO transactions
        (account_id, trade_date, action_canonical, action_raw,
         symbol, description, quantity, price, fees, amount,
         raw, source_file, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      accountId,
      tx.tradeDate,
      tx.actionCanonical,
      tx.actionRaw,
      tx.symbol,
      tx.description,
      tx.quantity,
      tx.price,
      tx.fees,
      tx.amount,
      JSON.stringify(tx.raw),
      sourceFile,
      hash,
    );
  return { inserted: result.changes > 0 };
}

export function listTransactionsByAccount(
  db: Database.Database,
  accountId: number,
): TransactionRow[] {
  return db
    .prepare(
      "SELECT * FROM transactions WHERE account_id = ? ORDER BY trade_date, id",
    )
    .all(accountId) as TransactionRow[];
}

export function unknownActionTally(
  db: Database.Database,
): Array<{ actionRaw: string; count: number }> {
  return db
    .prepare(
      `SELECT action_raw AS actionRaw, COUNT(*) AS count
       FROM transactions WHERE action_canonical = 'UNKNOWN'
       GROUP BY action_raw ORDER BY count DESC, actionRaw`,
    )
    .all() as Array<{ actionRaw: string; count: number }>;
}
