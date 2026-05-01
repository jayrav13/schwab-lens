import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import { insertTransaction } from "@/lib/db/repos/transactions";
import { loadAccountTradesView } from "@/lib/server/accountTrades";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("loadAccountTradesView", () => {
  it("returns null when uuid is unknown", async () => {
    const db = makeDb();
    const result = await loadAccountTradesView(
      "00000000-0000-0000-0000-000000000000",
      { db },
    );
    expect(result).toBeNull();
  });

  it("returns the account with an empty list when there are no option transactions", async () => {
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
    const result = await loadAccountTradesView(account.uuid, { db });
    expect(result).not.toBeNull();
    expect(result?.account.uuid).toBe(account.uuid);
    expect(result?.closedTrades).toEqual([]);
  });

  it("returns one closed trade for a SellToOpen + Expired pair", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "200", label: "Wheel" });
    insertTransaction(
      db,
      account.id,
      {
        tradeDate: "2026-01-05",
        actionCanonical: "SELL_TO_OPEN",
        actionRaw: "Sell to Open",
        symbol: "ACME 02/20/2026 100.00 P",
        description: "PUT ACME CORP $100 EXP 02/20/26",
        quantity: 1,
        price: 1.5,
        fees: 0,
        amount: 150,
        raw: { Action: "Sell to Open" },
      },
      "demo.csv",
    );
    insertTransaction(
      db,
      account.id,
      {
        tradeDate: "2026-02-20",
        actionCanonical: "EXPIRATION",
        actionRaw: "Expired",
        symbol: "ACME 02/20/2026 100.00 P",
        description: "PUT ACME CORP $100 EXP 02/20/26",
        quantity: 1,
        price: 0,
        fees: 0,
        amount: 0,
        raw: { Action: "Expired" },
      },
      "demo.csv",
    );

    const result = await loadAccountTradesView(account.uuid, { db });
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.closedTrades).toHaveLength(1);
    expect(result.closedTrades[0].outcome).toBe("Expired");
    expect(result.closedTrades[0].contract.ticker).toBe("ACME");
    expect(result.closedTrades[0].contract.strike).toBe(100);
    expect(result.closedTrades[0].contract.type).toBe("Put");
    expect(result.closedTrades[0].netPnL).toBeCloseTo(150);
  });
});
