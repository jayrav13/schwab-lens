import { describe, it, expect } from "vitest";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import {
  insertPositionSnapshots,
  listLatestSnapshot,
  listEarliestSnapshot,
  listSnapshotAsOfDates,
} from "@/lib/db/repos/positionSnapshots";

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

const ROW = {
  asOf: "2026-01-05",
  symbol: "FAKE",
  description: "FAKE INC",
  quantity: 10,
  price: 55,
  marketValue: 550,
  costBasis: 500,
  assetType: "equity" as const,
  raw: { Symbol: "FAKE" } as Record<string, unknown>,
  sourceFile: "Demo-Positions-2026-01-05-090000.csv",
  contentHash: "ps-1",
};

describe("position_snapshots repo", () => {
  it("inserts new snapshots; re-insert is a no-op", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    expect(insertPositionSnapshots(db, accountId, [ROW])).toEqual({ inserted: 1, skipped: 0 });
    expect(insertPositionSnapshots(db, accountId, [ROW])).toEqual({ inserted: 0, skipped: 1 });
  });

  it("listLatestSnapshot returns rows from the most recent as_of", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    insertPositionSnapshots(db, accountId, [
      { ...ROW, asOf: "2026-01-04", contentHash: "h-1" },
      { ...ROW, asOf: "2026-01-05", contentHash: "h-2" },
      { ...ROW, asOf: "2026-01-05", symbol: "OTHER", contentHash: "h-3" },
    ]);
    const latest = listLatestSnapshot(db, accountId);
    expect(latest.asOf).toBe("2026-01-05");
    expect(latest.rows.map((r) => r.symbol).sort()).toEqual(["FAKE", "OTHER"]);
  });

  it("listEarliestSnapshot returns rows from the earliest as_of", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    insertPositionSnapshots(db, accountId, [
      { ...ROW, asOf: "2026-01-04", contentHash: "h-1" },
      { ...ROW, asOf: "2026-01-05", contentHash: "h-2" },
    ]);
    expect(listEarliestSnapshot(db, accountId)?.asOf).toBe("2026-01-04");
  });

  it("listSnapshotAsOfDates returns distinct dates ordered ascending", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    insertPositionSnapshots(db, accountId, [
      { ...ROW, asOf: "2026-01-05", contentHash: "h-2" },
      { ...ROW, asOf: "2026-01-04", contentHash: "h-1" },
      { ...ROW, asOf: "2026-01-04", symbol: "OTHER", contentHash: "h-3" },
    ]);
    expect(listSnapshotAsOfDates(db, accountId)).toEqual(["2026-01-04", "2026-01-05"]);
  });

  it("listEarliestSnapshot returns null when no snapshots exist", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    expect(listEarliestSnapshot(db, accountId)).toBeNull();
  });
});
