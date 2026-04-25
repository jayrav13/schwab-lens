import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import { runIngest } from "@/lib/ingest/run";
import { listAccounts } from "@/lib/db/repos/accounts";
import { listTransactionsByAccount, countDistinctUnknownActions } from "@/lib/db/repos/transactions";
import { listLatestSnapshot } from "@/lib/db/repos/positionSnapshots";

function setupDataDir(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ingest-test-"));
  const txDir = path.join(root, "schwab", "999", "transactions");
  const posDir = path.join(root, "schwab", "999", "positions");
  mkdirSync(txDir, { recursive: true });
  mkdirSync(posDir, { recursive: true });
  const fixturesDir = path.join(process.cwd(), "tests", "fixtures", "schwab");
  copyFileSync(
    path.join(fixturesDir, "Demo_XXX999_Transactions_20260105-090000.csv"),
    path.join(txDir, "Demo_XXX999_Transactions_20260105-090000.csv"),
  );
  copyFileSync(
    path.join(fixturesDir, "Demo-Positions-2026-01-05-090000.csv"),
    path.join(posDir, "Demo-Positions-2026-01-05-090000.csv"),
  );
  return root;
}

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("runIngest", () => {
  it("ingests transactions and positions into a fresh DB", () => {
    const db = freshDb();
    const dataDir = setupDataDir();
    const summary = runIngest(db, dataDir);
    expect(summary.accountsTouched).toBe(1);
    expect(summary.transactionsInserted).toBe(3);
    expect(summary.snapshotsInserted).toBe(3);

    const accounts = listAccounts(db);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      brokerageSlug: "schwab",
      externalId: "999",
      label: "Demo",
    });
    expect(listTransactionsByAccount(db, accounts[0].id)).toHaveLength(3);
    const latest = listLatestSnapshot(db, accounts[0].id);
    expect(latest.asOf).toBe("2026-01-05");
  });

  it("auto-derives seed from earliest snapshot on first ingest", () => {
    const db = freshDb();
    runIngest(db, setupDataDir());
    const accounts = listAccounts(db);
    expect(accounts[0].seedDate).toBe("2026-01-05");
    expect(accounts[0].seedValue).toBeCloseTo(10099.34, 2);
  });

  it("does not overwrite an existing seed on re-ingest", () => {
    const db = freshDb();
    const dataDir = setupDataDir();
    runIngest(db, dataDir);
    const accounts = listAccounts(db);
    db.prepare("UPDATE accounts SET seed_date = ?, seed_value = ? WHERE id = ?")
      .run("2026-01-15", 12345, accounts[0].id);
    runIngest(db, dataDir);
    const after = listAccounts(db);
    expect(after[0].seedDate).toBe("2026-01-15");
    expect(after[0].seedValue).toBe(12345);
  });

  it("re-running ingest is a no-op (zero new inserts)", () => {
    const db = freshDb();
    const dataDir = setupDataDir();
    runIngest(db, dataDir);
    const summary = runIngest(db, dataDir);
    expect(summary.transactionsInserted).toBe(0);
    expect(summary.snapshotsInserted).toBe(0);
    expect(summary.transactionsSkipped).toBeGreaterThan(0);
  });

  it("reports unmapped action counts in the summary", () => {
    const db = freshDb();
    const summary = runIngest(db, setupDataDir());
    expect(summary.unmappedActions).toEqual(countDistinctUnknownActions(db));
  });
});
