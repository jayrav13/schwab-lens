import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface Account {
  id: number;
  uuid: string;
  externalId: string;
  label: string;
  seedDate: string | null;
  seedValue: number | null;
  benchmark: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface AccountRow {
  id: number;
  uuid: string;
  external_id: string;
  label: string;
  seed_date: string | null;
  seed_value: number | null;
  benchmark: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    uuid: row.uuid,
    externalId: row.external_id,
    label: row.label,
    seedDate: row.seed_date,
    seedValue: row.seed_value,
    benchmark: row.benchmark,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function upsertAccount(
  db: Database.Database,
  args: { externalId: string; label: string },
): Account {
  const now = new Date().toISOString();
  const existing = db
    .prepare("SELECT * FROM accounts WHERE external_id = ?")
    .get(args.externalId) as AccountRow | undefined;

  if (existing) {
    db.prepare(
      "UPDATE accounts SET label = ?, last_seen_at = ? WHERE id = ?",
    ).run(args.label, now, existing.id);
    return rowToAccount({
      ...existing,
      label: args.label,
      last_seen_at: now,
    });
  }

  const uuid = randomUUID();
  const result = db
    .prepare(
      `INSERT INTO accounts (uuid, external_id, label, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(uuid, args.externalId, args.label, now, now);
  const row = db
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .get(result.lastInsertRowid) as AccountRow;
  return rowToAccount(row);
}

export function getAccountByExternalId(
  db: Database.Database,
  externalId: string,
): Account | null {
  const row = db
    .prepare("SELECT * FROM accounts WHERE external_id = ?")
    .get(externalId) as AccountRow | undefined;
  return row ? rowToAccount(row) : null;
}

export function getAccountByUuid(
  db: Database.Database,
  uuid: string,
): Account | null {
  const row = db
    .prepare("SELECT * FROM accounts WHERE uuid = ?")
    .get(uuid) as AccountRow | undefined;
  return row ? rowToAccount(row) : null;
}

export function listAccounts(db: Database.Database): Account[] {
  return (db.prepare("SELECT * FROM accounts ORDER BY id").all() as AccountRow[]).map(
    rowToAccount,
  );
}

export function setSeed(
  db: Database.Database,
  externalId: string,
  seedDate: string | null,
  seedValue: number | null,
): void {
  db.prepare(
    "UPDATE accounts SET seed_date = ?, seed_value = ? WHERE external_id = ?",
  ).run(seedDate, seedValue, externalId);
}

export function setBenchmark(
  db: Database.Database,
  externalId: string,
  benchmark: string | null,
): void {
  db.prepare("UPDATE accounts SET benchmark = ? WHERE external_id = ?").run(
    benchmark,
    externalId,
  );
}
