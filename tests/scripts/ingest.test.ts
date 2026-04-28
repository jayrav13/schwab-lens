import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ingest } from "@/scripts/ingest";
import { runMigrations } from "@/lib/db/migrate";
import {
  listAccounts,
  getAccountByExternalId,
} from "@/lib/db/repos/accounts";
import { listTransactionsByAccount } from "@/lib/db/repos/transactions";
import { getEarliestSnapshotDate } from "@/lib/db/repos/positionSnapshots";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(path.join(os.tmpdir(), "test-ingest-"));
  mkdirSync(path.join(testDir, "transactions"), { recursive: true });
  mkdirSync(path.join(testDir, "positions"), { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function writeFixture(rel: string, content: string): void {
  writeFileSync(path.join(testDir, rel), content);
}

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("ingest — account discovery", () => {
  it("discovers an account from a transactions filename", async () => {
    writeFixture(
      "transactions/Demo_XXX100_Transactions_20260427-090135.csv",
      `"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"\n"01/05/2026","Buy","ACME","ACME CORP","100","$50.00","$0.00","-$5000.00"\n`,
    );
    const db = makeDb();
    const summary = await ingest({ db, dataDir: testDir });
    const accounts = listAccounts(db);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].externalId).toBe("100");
    expect(accounts[0].label).toBe("Demo");
    expect(summary.accountsTouched).toContain("100");
  });

  it("discovers an account from a positions filename + content", async () => {
    writeFixture(
      "positions/Demo-Positions-2026-04-25-123847.csv",
      `"Positions for account Demo ...100 as of 09:00 AM ET, 2026/04/25"\n\n"Symbol","Description","Qty (Quantity)","Price","Mkt Val (Market Value)","Cost Basis","Asset Type"\n"ACME","ACME CORP","100","$50.00","$5000.00","$4500.00","Equity"\n`,
    );
    const db = makeDb();
    await ingest({ db, dataDir: testDir });
    const accounts = listAccounts(db);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].externalId).toBe("100");
  });
});

describe("ingest — row insertion", () => {
  it("inserts transactions and snapshots", async () => {
    writeFixture(
      "transactions/Demo_XXX100_Transactions_20260427-090135.csv",
      `"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"\n"01/05/2026","Buy","ACME","ACME CORP","100","$50.00","$0.00","-$5000.00"\n`,
    );
    writeFixture(
      "positions/Demo-Positions-2026-04-25-123847.csv",
      `"Positions for account Demo ...100 as of 09:00 AM ET, 2026/04/25"\n\n"Symbol","Description","Qty (Quantity)","Price","Mkt Val (Market Value)","Cost Basis","Asset Type"\n"ACME","ACME CORP","100","$50.00","$5000.00","$4500.00","Equity"\n`,
    );
    const db = makeDb();
    const summary = await ingest({ db, dataDir: testDir });
    expect(summary.rowsInserted).toBeGreaterThan(0);
    const account = getAccountByExternalId(db, "100")!;
    expect(listTransactionsByAccount(db, account.id)).toHaveLength(1);
    expect(getEarliestSnapshotDate(db, account.id)).toBe("2026-04-25");
  });

  it("is idempotent: re-run inserts zero rows", async () => {
    writeFixture(
      "transactions/Demo_XXX100_Transactions_20260427-090135.csv",
      `"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"\n"01/05/2026","Buy","ACME","ACME CORP","100","$50.00","$0.00","-$5000.00"\n`,
    );
    const db = makeDb();
    const first = await ingest({ db, dataDir: testDir });
    const second = await ingest({ db, dataDir: testDir });
    expect(first.rowsInserted).toBeGreaterThan(0);
    expect(second.rowsInserted).toBe(0);
    expect(second.rowsSkippedDuplicate).toBe(first.rowsInserted);
  });
});
