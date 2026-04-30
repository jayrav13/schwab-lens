import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount, setSeed } from "@/lib/db/repos/accounts";
import { insertTransaction } from "@/lib/db/repos/transactions";
import { insertSnapshot } from "@/lib/db/repos/positionSnapshots";
import { setBoolean } from "@/lib/db/repos/settings";
import { loadAccountOverviewView } from "@/lib/server/accountOverview";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("loadAccountOverviewView", () => {
  it("returns null when uuid is unknown", async () => {
    const db = makeDb();
    const result = await loadAccountOverviewView(
      "00000000-0000-0000-0000-000000000000",
      { db, period: "YTD", today: "2026-04-29" },
    );
    expect(result).toBeNull();
  });

  it("returns no-data when account has no tx and no snapshots", async () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    setSeed(db, "100", "2026-01-15", 12345);
    const result = await loadAccountOverviewView(account.uuid, {
      db,
      period: "YTD",
      today: "2026-04-29",
    });
    expect(result?.kind).toBe("no-data");
  });

  it("returns ready with NAV, holdings, recent transactions, allocation", async () => {
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
    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-04-25",
        symbol: "Cash & Cash Investments",
        description: null,
        quantity: null,
        price: null,
        marketValue: 5000,
        costBasis: null,
        assetType: "cash",
        raw: {},
      },
      "snap.csv",
    );

    const result = await loadAccountOverviewView(account.uuid, {
      db,
      period: "YTD",
      today: "2026-04-29",
      includeMarketData: false,
    });

    expect(result?.kind).toBe("ready");
    if (result?.kind !== "ready") return;

    expect(result.account.uuid).toBe(account.uuid);
    expect(result.nav.current).toBeGreaterThan(0);
    expect(result.holdings.find((h) => h.symbol === "ACME")?.value).toBe(6000);
    expect(result.transactions).toHaveLength(1);
    expect(result.allocation.bar.length).toBeGreaterThan(0);
    expect(result.sourceFiles.transactions).toContain("demo.csv");
    expect(result.sourceFiles.positions).toContain("snap.csv");
    expect(result.dataThroughDate).toBe("2026-04-25");

    const totalPct = result.allocation.bar.reduce((a, s) => a + s.pct, 0);
    expect(totalPct).toBeCloseTo(1, 2);

    expect(
      result.allocation.equityRows.find((r) => r.symbol === "ACME"),
    ).toBeTruthy();
  });

  it("clamps period start to seed when period predates seed", async () => {
    const db = makeDb();
    setBoolean(db, "market_data.enabled", false);
    const account = upsertAccount(db, { externalId: "200", label: "Demo2" });
    setSeed(db, "200", "2026-03-01", 10000);
    insertSnapshot(
      db,
      account.id,
      {
        asOf: "2026-03-01",
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
    const result = await loadAccountOverviewView(account.uuid, {
      db,
      period: "1Y",
      today: "2026-04-29",
      includeMarketData: false,
    });
    if (result?.kind !== "ready") throw new Error("expected ready");
    expect(result.nav.computation.clampedToSeed).toBe(true);
    expect(result.nav.computation.effectiveStart).toBe("2026-03-01");
  });
});
