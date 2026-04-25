import type { Db } from "@/lib/db/connect";

export type Account = {
  id: number;
  brokerageSlug: string;
  externalId: string;
  label: string;
  seedDate: string | null;
  seedValue: number | null;
  benchmark: string | null;
  expectedRealReturn: number | null;
  targetValue: number | null;
  accountGroup: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

type AccountRow = {
  id: number;
  brokerage_slug: string;
  external_id: string;
  label: string;
  seed_date: string | null;
  seed_value: number | null;
  benchmark: string | null;
  expected_real_return: number | null;
  target_value: number | null;
  account_group: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    brokerageSlug: r.brokerage_slug,
    externalId: r.external_id,
    label: r.label,
    seedDate: r.seed_date,
    seedValue: r.seed_value,
    benchmark: r.benchmark,
    expectedRealReturn: r.expected_real_return,
    targetValue: r.target_value,
    accountGroup: r.account_group,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
  };
}

export type UpsertAccountInput = {
  brokerageSlug: string;
  externalId: string;
  label: string;
  now?: string;
};

export function upsertAccount(db: Db, input: UpsertAccountInput): number {
  const now = input.now ?? new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO accounts (brokerage_slug, external_id, label, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(brokerage_slug, external_id) DO UPDATE SET
      label = excluded.label,
      last_seen_at = excluded.last_seen_at
    RETURNING id
  `);
  const row = stmt.get(input.brokerageSlug, input.externalId, input.label, now, now) as { id: number };
  return row.id;
}

export function getAccountByExternal(
  db: Db,
  brokerageSlug: string,
  externalId: string,
): Account | null {
  const row = db
    .prepare("SELECT * FROM accounts WHERE brokerage_slug = ? AND external_id = ?")
    .get(brokerageSlug, externalId) as AccountRow | undefined;
  return row ? rowToAccount(row) : null;
}

export function getAccountById(db: Db, id: number): Account | null {
  const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow | undefined;
  return row ? rowToAccount(row) : null;
}

export function listAccounts(db: Db): Account[] {
  const rows = db
    .prepare("SELECT * FROM accounts ORDER BY brokerage_slug, external_id")
    .all() as AccountRow[];
  return rows.map(rowToAccount);
}

export function updateAccountSeed(
  db: Db,
  accountId: number,
  seedDate: string | null,
  seedValue: number | null,
): void {
  db.prepare("UPDATE accounts SET seed_date = ?, seed_value = ? WHERE id = ?")
    .run(seedDate, seedValue, accountId);
}

export function updateAccountLabel(db: Db, accountId: number, label: string): void {
  db.prepare("UPDATE accounts SET label = ? WHERE id = ?").run(label, accountId);
}

export function updateAccountBenchmark(
  db: Db,
  accountId: number,
  benchmark: string | null,
): void {
  db.prepare("UPDATE accounts SET benchmark = ? WHERE id = ?").run(benchmark, accountId);
}

export function updateAccountReturn(
  db: Db,
  accountId: number,
  rate: number | null,
): void {
  db.prepare("UPDATE accounts SET expected_real_return = ? WHERE id = ?")
    .run(rate, accountId);
}

export function updateAccountTarget(
  db: Db,
  accountId: number,
  target: number | null,
): void {
  db.prepare("UPDATE accounts SET target_value = ? WHERE id = ?")
    .run(target, accountId);
}

export function updateAccountGroup(
  db: Db,
  accountId: number,
  group: string | null,
): void {
  db.prepare("UPDATE accounts SET account_group = ? WHERE id = ?")
    .run(group, accountId);
}
