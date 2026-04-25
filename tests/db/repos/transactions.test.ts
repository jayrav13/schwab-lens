import { describe, it, expect } from "vitest";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import {
  insertTransactions,
  listTransactionsByAccount,
  countDistinctUnknownActions,
} from "@/lib/db/repos/transactions";

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

const SAMPLE_ROW = {
  tradeDate: "2026-01-02",
  actionCanonical: "SELL_TO_OPEN" as const,
  actionRaw: "Sell to Open",
  symbol: "FAKE 01/09/2026 10.00 P",
  description: "PUT FAKE EXP 01/09/26",
  quantity: 1,
  price: 1,
  fees: 0.66,
  amount: 99.34,
  raw: { Date: "01/02/2026", Action: "Sell to Open" } as Record<string, unknown>,
  sourceFile: "Demo_XXX999_Transactions_20260105-000000.csv",
  contentHash: "tx-hash-1",
};

describe("transactions repo", () => {
  it("inserts new rows and returns the count inserted", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    expect(insertTransactions(db, accountId, [SAMPLE_ROW])).toEqual({ inserted: 1, skipped: 0 });
  });

  it("re-inserting the same content_hash is a no-op", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    insertTransactions(db, accountId, [SAMPLE_ROW]);
    expect(insertTransactions(db, accountId, [SAMPLE_ROW])).toEqual({ inserted: 0, skipped: 1 });
  });

  it("listTransactionsByAccount returns rows ordered by trade_date", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    insertTransactions(db, accountId, [
      { ...SAMPLE_ROW, tradeDate: "2026-01-04", contentHash: "h-3" },
      { ...SAMPLE_ROW, tradeDate: "2026-01-02", contentHash: "h-1" },
      { ...SAMPLE_ROW, tradeDate: "2026-01-03", contentHash: "h-2" },
    ]);
    const txs = listTransactionsByAccount(db, accountId);
    expect(txs.map((t) => t.tradeDate)).toEqual(["2026-01-02", "2026-01-03", "2026-01-04"]);
  });

  it("countDistinctUnknownActions tallies UNKNOWN action_raw counts", () => {
    const db = freshDb();
    const accountId = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "X" });
    insertTransactions(db, accountId, [
      { ...SAMPLE_ROW, actionCanonical: "UNKNOWN", actionRaw: "Mystery", contentHash: "h-1" },
      { ...SAMPLE_ROW, actionCanonical: "UNKNOWN", actionRaw: "Mystery", contentHash: "h-2" },
      { ...SAMPLE_ROW, actionCanonical: "UNKNOWN", actionRaw: "Other",   contentHash: "h-3" },
    ]);
    expect(countDistinctUnknownActions(db)).toEqual([
      { actionRaw: "Mystery", count: 2 },
      { actionRaw: "Other", count: 1 },
    ]);
  });
});
