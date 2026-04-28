import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import {
  insertSnapshot,
  getLatestSnapshotDate,
  getSnapshotByDate,
  getEarliestSnapshotDate,
} from "@/lib/db/repos/positionSnapshots";
import type { CanonicalPositionSnapshot } from "@/lib/schwab/types";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

function makeSnap(overrides: Partial<CanonicalPositionSnapshot> = {}): CanonicalPositionSnapshot {
  return {
    asOf: "2026-04-23",
    symbol: "ACME",
    description: null,
    quantity: 100,
    price: 50,
    marketValue: 5000,
    costBasis: null,
    assetType: "equity",
    raw: { Symbol: "ACME" },
    ...overrides,
  };
}

describe("positionSnapshots repo", () => {
  it("inserts a snapshot and retrieves by date", () => {
    const db = makeDb();
    const a = upsertAccount(db, { externalId: "100", label: "Demo" });
    insertSnapshot(db, a.id, makeSnap(), "demo.csv");
    const rows = getSnapshotByDate(db, a.id, "2026-04-23");
    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe("ACME");
  });

  it("getLatestSnapshotDate returns the max as_of", () => {
    const db = makeDb();
    const a = upsertAccount(db, { externalId: "100", label: "Demo" });
    insertSnapshot(db, a.id, makeSnap({ asOf: "2026-04-23" }), "a.csv");
    insertSnapshot(db, a.id, makeSnap({ asOf: "2026-04-25", symbol: "X" }), "b.csv");
    expect(getLatestSnapshotDate(db, a.id)).toBe("2026-04-25");
  });

  it("getEarliestSnapshotDate returns the min as_of", () => {
    const db = makeDb();
    const a = upsertAccount(db, { externalId: "100", label: "Demo" });
    insertSnapshot(db, a.id, makeSnap({ asOf: "2026-04-23" }), "a.csv");
    insertSnapshot(db, a.id, makeSnap({ asOf: "2026-04-25", symbol: "X" }), "b.csv");
    expect(getEarliestSnapshotDate(db, a.id)).toBe("2026-04-23");
  });

  it("INSERT OR IGNORE makes duplicate inserts a no-op", () => {
    const db = makeDb();
    const a = upsertAccount(db, { externalId: "100", label: "Demo" });
    insertSnapshot(db, a.id, makeSnap(), "demo.csv");
    insertSnapshot(db, a.id, makeSnap(), "demo.csv");
    expect(getSnapshotByDate(db, a.id, "2026-04-23")).toHaveLength(1);
  });

  it("returns null for accounts with no snapshots", () => {
    const db = makeDb();
    const a = upsertAccount(db, { externalId: "100", label: "Demo" });
    expect(getLatestSnapshotDate(db, a.id)).toBeNull();
    expect(getEarliestSnapshotDate(db, a.id)).toBeNull();
  });
});
