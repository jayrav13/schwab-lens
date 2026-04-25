import type { Db } from "@/lib/db/connect";
import type { CanonicalTransaction } from "@/lib/brokerage/types";

export type StoredTransaction = CanonicalTransaction & {
  id: number;
  accountId: number;
  sourceFile: string;
  contentHash: string;
};

export type InsertableTransaction = CanonicalTransaction & {
  sourceFile: string;
  contentHash: string;
};

type TxRow = {
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
};

function rowToStored(r: TxRow): StoredTransaction {
  return {
    id: r.id,
    accountId: r.account_id,
    tradeDate: r.trade_date,
    actionCanonical: r.action_canonical as StoredTransaction["actionCanonical"],
    actionRaw: r.action_raw,
    symbol: r.symbol,
    description: r.description,
    quantity: r.quantity,
    price: r.price,
    fees: r.fees,
    amount: r.amount,
    raw: JSON.parse(r.raw),
    sourceFile: r.source_file,
    contentHash: r.content_hash,
  };
}

export function insertTransactions(
  db: Db,
  accountId: number,
  rows: InsertableTransaction[],
): { inserted: number; skipped: number } {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO transactions (
      account_id, trade_date, action_canonical, action_raw,
      symbol, description, quantity, price, fees, amount,
      raw, source_file, content_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  let skipped = 0;
  const insertAll = db.transaction((batch: InsertableTransaction[]) => {
    for (const r of batch) {
      const result = stmt.run(
        accountId,
        r.tradeDate,
        r.actionCanonical,
        r.actionRaw,
        r.symbol,
        r.description,
        r.quantity,
        r.price,
        r.fees,
        r.amount,
        JSON.stringify(r.raw),
        r.sourceFile,
        r.contentHash,
      );
      if (result.changes === 1) inserted++;
      else skipped++;
    }
  });
  insertAll(rows);
  return { inserted, skipped };
}

export function listTransactionsByAccount(
  db: Db,
  accountId: number,
): StoredTransaction[] {
  const rows = db
    .prepare("SELECT * FROM transactions WHERE account_id = ? ORDER BY trade_date, id")
    .all(accountId) as TxRow[];
  return rows.map(rowToStored);
}

export function countDistinctUnknownActions(
  db: Db,
): Array<{ actionRaw: string; count: number }> {
  const rows = db
    .prepare(`
      SELECT action_raw AS actionRaw, COUNT(*) AS count
      FROM transactions
      WHERE action_canonical = 'UNKNOWN'
      GROUP BY action_raw
      ORDER BY count DESC, action_raw
    `)
    .all() as Array<{ actionRaw: string; count: number }>;
  return rows;
}
