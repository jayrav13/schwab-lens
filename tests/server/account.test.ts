import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount, setSeed } from "@/lib/db/repos/accounts";
import { insertTransaction } from "@/lib/db/repos/transactions";
import { insertSnapshot } from "@/lib/db/repos/positionSnapshots";
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

  it("keeps all transactions when snapshot post-dates them and no override is set", async () => {
    // Regression for issue #23: previously the loader fell back to the snapshot
    // date as the config seed, which then filtered out every transaction
    // before that date — even though chooseSeed correctly rejected the
    // snapshot as a seed.
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "999", label: "DemoBug" });
    for (const date of ["2026-01-05", "2026-02-10", "2026-03-15", "2026-04-20"]) {
      insertTransaction(
        db,
        account.id,
        {
          tradeDate: date,
          actionCanonical: "BUY",
          actionRaw: "Buy",
          symbol: "ACME",
          description: "ACME CORP",
          quantity: 1,
          price: 50,
          fees: 0,
          amount: -50,
          raw: { Action: "Buy" },
        },
        "demo.csv",
      );
    }
    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-04-28",
        symbol: "ACME",
        description: "ACME CORP",
        quantity: 4,
        price: 60,
        marketValue: 240,
        costBasis: 200,
        assetType: "equity",
        raw: {},
      },
      "snap.csv",
    );

    const result = await loadAccountOptionsView(account.uuid, { db });
    if (result?.kind !== "ready") throw new Error("expected ready");
    expect(result.state.transactions).toHaveLength(4);
    expect(result.state.config.seedDate).toBe("");
    expect(result.state.config.seedValue).toBe(0);
    expect(result.state.warnings.some((w) => w.kind === "MissingSeed")).toBe(true);
  });

  it("falls back to earliest snapshot for seed when no override is set", async () => {
    const db = makeDb();
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

  it("includes a twr result with the loaded view", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "twr2", label: "TWR" });
    setSeed(db, "twr2", "2026-01-01", 10000);
    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-01-01",
        symbol: "ACME",
        description: "A",
        quantity: 100,
        price: 100,
        marketValue: 10000,
        costBasis: 10000,
        assetType: "equity",
        raw: {},
      },
      "s1.csv",
    );
    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-03-01",
        symbol: "ACME",
        description: "A",
        quantity: 100,
        price: 110,
        marketValue: 11000,
        costBasis: 10000,
        assetType: "equity",
        raw: {},
      },
      "s2.csv",
    );

    const result = await loadAccountOptionsView(account.uuid, {
      db,
      includeMarketData: false,
      today: "2026-03-15",
    });
    if (result?.kind !== "ready") throw new Error("expected ready");
    expect(result.twr).toBeDefined();
    expect(result.twr.twr).not.toBeNull();
    expect(result.twr.twr!).toBeCloseTo(0.1, 4);
  });
});
