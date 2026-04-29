import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount, setSeed } from "@/lib/db/repos/accounts";
import { insertTransaction } from "@/lib/db/repos/transactions";
import { insertSnapshot } from "@/lib/db/repos/positionSnapshots";
import { setBoolean } from "@/lib/db/repos/settings";
import { loadAccountOptionsView } from "@/lib/server/account";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("loadAccountOptionsView", () => {
  it("returns null when uuid is unknown", async () => {
    const db = makeDb();
    const result = await loadAccountOptionsView(
      "00000000-0000-0000-0000-000000000000",
      { db },
    );
    expect(result).toBeNull();
  });

  it("returns no-data when account exists but has no transactions or snapshots", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    setSeed(db, "100", "2026-01-15", 12345);
    const result = await loadAccountOptionsView(account.uuid, { db });
    expect(result?.kind).toBe("no-data");
  });

  it("builds a PortfolioState when transactions exist", async () => {
    const db = makeDb();
    setBoolean(db, "market_data.enabled", false);
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    setSeed(db, "100", "2026-01-01", 10000);

    insertTransaction(
      db,
      account.id,
      {
        tradeDate: "2026-01-05",
        actionCanonical: "BUY",
        actionRaw: "Buy",
        symbol: "ACME",
        description: "ACME CORP",
        quantity: 100,
        price: 50,
        fees: 0,
        amount: -5000,
        raw: { Action: "Buy" },
      },
      "demo.csv",
    );

    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-04-25",
        symbol: "ACME",
        description: "ACME CORP",
        quantity: 100,
        price: 60,
        marketValue: 6000,
        costBasis: 5000,
        assetType: "equity",
        raw: {},
      },
      "snap.csv",
    );

    const result = await loadAccountOptionsView(account.uuid, { db });
    expect(result?.kind).toBe("ready");
    if (result?.kind !== "ready") return;
    expect(result.account.uuid).toBe(account.uuid);
    expect(result.state.config.seedValue).toBe(10000);
    expect(result.state.transactions).toHaveLength(1);
    expect(result.state.cashLedger.length).toBeGreaterThan(0);
  });

  it("includes a markToMarket field that is null when no held positions", async () => {
    const db = makeDb();
    setBoolean(db, "market_data.enabled", true);
    const account = upsertAccount(db, { externalId: "300", label: "Demo3" });
    setSeed(db, "300", "2026-01-01", 10000);
    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-01-01",
        symbol: "Cash & Cash Investments",
        description: null,
        quantity: null,
        price: null,
        marketValue: 10000,
        costBasis: null,
        assetType: "cash",
        raw: {},
      },
      "snap.csv",
    );
    const result = await loadAccountOptionsView(account.uuid, {
      db,
      includeMarketData: false,
    });
    expect(result?.kind).toBe("ready");
    if (result?.kind !== "ready") return;
    expect(result.markToMarket).toBeNull();
  });

  it("falls back to earliest snapshot for seed when no override is set", async () => {
    const db = makeDb();
    setBoolean(db, "market_data.enabled", false);
    const account = upsertAccount(db, { externalId: "200", label: "Demo2" });
    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-04-01",
        symbol: "ACME",
        description: "ACME CORP",
        quantity: 100,
        price: 40,
        marketValue: 4000,
        costBasis: 4000,
        assetType: "equity",
        raw: {},
      },
      "snap.csv",
    );

    const result = await loadAccountOptionsView(account.uuid, { db });
    expect(result?.kind).toBe("ready");
    if (result?.kind !== "ready") return;
    expect(result.state.config.seedDate).toBe("2026-04-01");
  });
});
