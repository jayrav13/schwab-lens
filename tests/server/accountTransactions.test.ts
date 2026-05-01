import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import { insertTransaction } from "@/lib/db/repos/transactions";
import { loadAccountTransactionsView } from "@/lib/server/accountTransactions";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("loadAccountTransactionsView", () => {
  it("returns null when uuid is unknown", async () => {
    const db = makeDb();
    const result = await loadAccountTransactionsView(
      "00000000-0000-0000-0000-000000000000",
      { db },
    );
    expect(result).toBeNull();
  });

  it("returns the account with an empty list when no transactions exist", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    const result = await loadAccountTransactionsView(account.uuid, { db });
    expect(result).not.toBeNull();
    expect(result?.account.uuid).toBe(account.uuid);
    expect(result?.transactions).toEqual([]);
  });

  it("returns transactions in trade-date desc order with mapped fields", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    insertTransaction(
      db,
      account.id,
      {
        tradeDate: "2026-01-05",
        actionCanonical: "BUY",
        actionRaw: "Buy",
        symbol: "ACME",
        description: "ACME CORP",
        quantity: 10,
        price: 50,
        fees: 0,
        amount: -500,
        raw: { Action: "Buy" },
      },
      "demo.csv",
    );
    insertTransaction(
      db,
      account.id,
      {
        tradeDate: "2026-02-10",
        actionCanonical: "SELL",
        actionRaw: "Sell",
        symbol: "ACME",
        description: "ACME CORP",
        quantity: 10,
        price: 60,
        fees: 0,
        amount: 600,
        raw: { Action: "Sell" },
      },
      "demo.csv",
    );

    const result = await loadAccountTransactionsView(account.uuid, { db });
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].tradeDate).toBe("2026-02-10");
    expect(result.transactions[0].action).toBe("Sell");
    expect(result.transactions[1].tradeDate).toBe("2026-01-05");
    expect(result.transactions[1].action).toBe("Buy");
  });
});
