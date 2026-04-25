import type { Db } from "@/lib/db/connect";
import type {
  CanonicalPositionSnapshot,
  AssetType,
} from "@/lib/brokerage/types";

export type StoredSnapshotRow = CanonicalPositionSnapshot & {
  id: number;
  accountId: number;
  sourceFile: string;
  contentHash: string;
};

export type InsertableSnapshotRow = CanonicalPositionSnapshot & {
  sourceFile: string;
  contentHash: string;
};

type DbRow = {
  id: number;
  account_id: number;
  as_of: string;
  symbol: string;
  description: string | null;
  quantity: number | null;
  price: number | null;
  market_value: number | null;
  cost_basis: number | null;
  asset_type: string | null;
  raw: string;
  source_file: string;
  content_hash: string;
};

function rowToStored(r: DbRow): StoredSnapshotRow {
  return {
    id: r.id,
    accountId: r.account_id,
    asOf: r.as_of,
    symbol: r.symbol,
    description: r.description,
    quantity: r.quantity,
    price: r.price,
    marketValue: r.market_value,
    costBasis: r.cost_basis,
    assetType: r.asset_type as AssetType | null,
    raw: JSON.parse(r.raw),
    sourceFile: r.source_file,
    contentHash: r.content_hash,
  };
}

export function insertPositionSnapshots(
  db: Db,
  accountId: number,
  rows: InsertableSnapshotRow[],
): { inserted: number; skipped: number } {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO position_snapshots (
      account_id, as_of, symbol, description, quantity, price,
      market_value, cost_basis, asset_type, raw, source_file, content_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  let skipped = 0;
  const tx = db.transaction((batch: InsertableSnapshotRow[]) => {
    for (const r of batch) {
      const result = stmt.run(
        accountId, r.asOf, r.symbol, r.description, r.quantity, r.price,
        r.marketValue, r.costBasis, r.assetType,
        JSON.stringify(r.raw), r.sourceFile, r.contentHash,
      );
      if (result.changes === 1) inserted++;
      else skipped++;
    }
  });
  tx(rows);
  return { inserted, skipped };
}

export type SnapshotForDate = {
  asOf: string;
  rows: StoredSnapshotRow[];
};

export function listLatestSnapshot(db: Db, accountId: number): SnapshotForDate {
  const dateRow = db
    .prepare("SELECT MAX(as_of) AS d FROM position_snapshots WHERE account_id = ?")
    .get(accountId) as { d: string | null };
  if (!dateRow.d) return { asOf: "", rows: [] };
  const rows = db
    .prepare("SELECT * FROM position_snapshots WHERE account_id = ? AND as_of = ? ORDER BY symbol")
    .all(accountId, dateRow.d) as DbRow[];
  return { asOf: dateRow.d, rows: rows.map(rowToStored) };
}

export function listEarliestSnapshot(db: Db, accountId: number): SnapshotForDate | null {
  const dateRow = db
    .prepare("SELECT MIN(as_of) AS d FROM position_snapshots WHERE account_id = ?")
    .get(accountId) as { d: string | null };
  if (!dateRow.d) return null;
  const rows = db
    .prepare("SELECT * FROM position_snapshots WHERE account_id = ? AND as_of = ? ORDER BY symbol")
    .all(accountId, dateRow.d) as DbRow[];
  return { asOf: dateRow.d, rows: rows.map(rowToStored) };
}

export function listSnapshotAsOfDates(db: Db, accountId: number): string[] {
  const rows = db
    .prepare("SELECT DISTINCT as_of AS d FROM position_snapshots WHERE account_id = ? ORDER BY as_of")
    .all(accountId) as Array<{ d: string }>;
  return rows.map((r) => r.d);
}
