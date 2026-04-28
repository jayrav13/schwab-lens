import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import {
  insertTransaction,
  listTransactionsByAccount,
  unknownActionTally,
} from "@/lib/db/repos/transactions";
import type { CanonicalTransaction } from "@/lib/schwab/types";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

function makeTx(overrides: Partial<CanonicalTransaction> = {}): CanonicalTransaction {
  return {
    tradeDate: "2026-01-02",
    actionCanonical: "BUY",
    actionRaw: "Buy",
    symbol: "ACME",
    description: null,
    quantity: 100,
    price: 50,
    fees: null,
    amount: -5000,
    raw: { Date: "2026-01-02" },
    ...overrides,
  };
}

describe("transactions repo", () => {
  it("inserts a transaction and lists it", () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    insertTransaction(db, account.id, makeTx(), "demo.csv");
    const rows = listTransactionsByAccount(db, account.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe("ACME");
  });

  it("INSERT OR IGNORE makes duplicate inserts a no-op", () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    const tx = makeTx();
    insertTransaction(db, account.id, tx, "demo.csv");
    insertTransaction(db, account.id, tx, "demo.csv");
    expect(listTransactionsByAccount(db, account.id)).toHaveLength(1);
  });

  it("different rows produce different content_hashes and insert separately", () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    insertTransaction(db, account.id, makeTx({ amount: -5000 }), "demo.csv");
    insertTransaction(db, account.id, makeTx({ amount: -5001 }), "demo.csv");
    expect(listTransactionsByAccount(db, account.id)).toHaveLength(2);
  });

  it("unknownActionTally returns counts per raw action", () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    insertTransaction(
      db,
      account.id,
      makeTx({ actionCanonical: "UNKNOWN", actionRaw: "Mystery", amount: 1 }),
      "demo.csv",
    );
    insertTransaction(
      db,
      account.id,
      makeTx({ actionCanonical: "UNKNOWN", actionRaw: "Mystery", amount: 2 }),
      "demo.csv",
    );
    insertTransaction(
      db,
      account.id,
      makeTx({ actionCanonical: "UNKNOWN", actionRaw: "Other", amount: 3 }),
      "demo.csv",
    );
    expect(unknownActionTally(db)).toEqual([
      { actionRaw: "Mystery", count: 2 },
      { actionRaw: "Other", count: 1 },
    ]);
  });
});
