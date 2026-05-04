import type Database from "better-sqlite3";
import { contentHash } from "@/lib/db/contentHash";
import type { CanonicalPositionSnapshot } from "@/lib/schwab/types";

export interface PositionSnapshotRow {
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
}

export function insertSnapshot(
  db: Database.Database,
  accountId: number,
  snap: CanonicalPositionSnapshot,
  sourceFile: string,
): { inserted: boolean } {
  const externalIdRow = db
    .prepare("SELECT external_id FROM accounts WHERE id = ?")
    .get(accountId) as { external_id: string };
  const hash = contentHash({
    external_id: externalIdRow.external_id,
    as_of: snap.asOf,
    symbol: snap.symbol,
    quantity: snap.quantity,
    market_value: snap.marketValue,
    cost_basis: snap.costBasis,
  });
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO position_snapshots
        (account_id, as_of, symbol, description, quantity, price,
         market_value, cost_basis, asset_type, raw, source_file, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      accountId,
      snap.asOf,
      snap.symbol,
      snap.description,
      snap.quantity,
      snap.price,
      snap.marketValue,
      snap.costBasis,
      snap.assetType,
      JSON.stringify(snap.raw),
      sourceFile,
      hash,
    );
  return { inserted: result.changes > 0 };
}

export function getSnapshotByDate(
  db: Database.Database,
  accountId: number,
  asOf: string,
): PositionSnapshotRow[] {
  return db
    .prepare(
      "SELECT * FROM position_snapshots WHERE account_id = ? AND as_of = ? ORDER BY id",
    )
    .all(accountId, asOf) as PositionSnapshotRow[];
}

export function getAllSnapshotsByAccount(
  db: Database.Database,
  accountId: number,
): PositionSnapshotRow[] {
  return db
    .prepare(
      "SELECT * FROM position_snapshots WHERE account_id = ? ORDER BY as_of, id",
    )
    .all(accountId) as PositionSnapshotRow[];
}

export function getLatestSnapshotDate(
  db: Database.Database,
  accountId: number,
): string | null {
  const row = db
    .prepare(
      "SELECT MAX(as_of) AS d FROM position_snapshots WHERE account_id = ?",
    )
    .get(accountId) as { d: string | null };
  return row.d;
}

export function getEarliestSnapshotDate(
  db: Database.Database,
  accountId: number,
): string | null {
  const row = db
    .prepare(
      "SELECT MIN(as_of) AS d FROM position_snapshots WHERE account_id = ?",
    )
    .get(accountId) as { d: string | null };
  return row.d;
}
