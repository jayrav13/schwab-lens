import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount, setSeed } from "@/lib/db/repos/accounts";
import { insertSnapshot } from "@/lib/db/repos/positionSnapshots";
import { insertTransaction } from "@/lib/db/repos/transactions";
import { loadHomeView } from "@/lib/server/home";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

function snap(
  db: Database.Database,
  accountId: number,
  asOf: string,
  symbol: string,
  marketValue: number,
) {
  insertSnapshot(
    db,
    accountId,
    {
      asOf,
      symbol,
      description: null,
      quantity: 1,
      price: marketValue,
      marketValue,
      costBasis: marketValue,
      assetType: "equity",
      raw: {},
    },
    `${asOf}.csv`,
  );
}

describe("loadHomeView", () => {
  it("returns an empty view with zero total when no accounts exist", async () => {
    const db = makeDb();
    const view = await loadHomeView({ db, today: "2026-05-01" });
    expect(view.accounts).toHaveLength(0);
    expect(view.total.nav).toBe(0);
    expect(view.total.twr).toBeNull();
    expect(view.total.navSeries).toEqual([]);
    expect(view.period.key).toBe("1M");
  });

  it("marks accounts with no transactions or snapshots as hasData=false", async () => {
    const db = makeDb();
    upsertAccount(db, { externalId: "100", label: "Empty" });

    const view = await loadHomeView({ db, today: "2026-05-01" });
    expect(view.accounts).toHaveLength(1);
    expect(view.accounts[0].hasData).toBe(false);
    expect(view.accounts[0].nav).toBe(0);
    expect(view.accounts[0].twr).toBeNull();
    expect(view.total.nav).toBe(0);
  });

  it("computes per-account TWR over the requested period and exposes a sparkline", async () => {
    const db = makeDb();
    const acct = upsertAccount(db, { externalId: "200", label: "TWR" });
    setSeed(db, "200", "2026-01-01", 10000);
    snap(db, acct.id, "2026-01-01", "ACME", 10000);
    snap(db, acct.id, "2026-04-01", "ACME", 11000);
    snap(db, acct.id, "2026-04-30", "ACME", 12100);

    const view = await loadHomeView({ db, period: "All", today: "2026-04-30" });
    expect(view.accounts).toHaveLength(1);
    const summary = view.accounts[0];
    expect(summary.hasData).toBe(true);
    expect(summary.nav).toBe(12100);
    // 10k → 12.1k = 21%
    expect(summary.twr).toBeCloseTo(0.21, 4);
    expect(summary.navSeries.length).toBeGreaterThanOrEqual(2);
    expect(summary.navSeries.at(-1)?.nav).toBe(12100);
  });

  it("aggregates total NAV across accounts and computes a NAV-weighted total TWR", async () => {
    const db = makeDb();
    const a = upsertAccount(db, { externalId: "100", label: "A" });
    setSeed(db, "100", "2026-01-01", 10000);
    snap(db, a.id, "2026-01-01", "A1", 10000);
    snap(db, a.id, "2026-04-30", "A1", 11000); // +10%

    const b = upsertAccount(db, { externalId: "200", label: "B" });
    setSeed(db, "200", "2026-01-01", 30000);
    snap(db, b.id, "2026-01-01", "B1", 30000);
    snap(db, b.id, "2026-04-30", "B1", 33600); // +12%

    const view = await loadHomeView({ db, period: "All", today: "2026-04-30" });
    expect(view.accounts).toHaveLength(2);
    expect(view.total.nav).toBe(11000 + 33600);
    // weighted: (0.10 * 10k + 0.12 * 30k) / 40k = 0.115
    expect(view.total.twr).toBeCloseTo(0.115, 4);
  });

  it("forward-fills the total NAV series across accounts with disjoint snapshot dates", async () => {
    const db = makeDb();
    const a = upsertAccount(db, { externalId: "100", label: "A" });
    setSeed(db, "100", "2026-01-01", 100);
    snap(db, a.id, "2026-01-01", "A1", 100);
    snap(db, a.id, "2026-03-01", "A1", 150);

    const b = upsertAccount(db, { externalId: "200", label: "B" });
    setSeed(db, "200", "2026-01-01", 200);
    snap(db, b.id, "2026-02-01", "B1", 200);
    snap(db, b.id, "2026-04-01", "B1", 250);

    const view = await loadHomeView({ db, period: "All", today: "2026-04-01" });
    const series = view.total.navSeries;
    const byDate = Object.fromEntries(series.map((p) => [p.date, p.nav]));

    // 2026-01-01: only A reported (100); B has no snapshot yet → 0.
    expect(byDate["2026-01-01"]).toBe(100);
    // 2026-02-01: A still 100 (forward-filled), B starts at 200 → 300.
    expect(byDate["2026-02-01"]).toBe(300);
    // 2026-03-01: A jumps to 150, B forward-filled at 200 → 350.
    expect(byDate["2026-03-01"]).toBe(350);
    // 2026-04-01: A forward-filled at 150, B at 250 → 400.
    expect(byDate["2026-04-01"]).toBe(400);
  });

  it("clamps the per-account period when the account's data does not reach the period start", async () => {
    const db = makeDb();
    const acct = upsertAccount(db, { externalId: "100", label: "Late" });
    // No seed; account first appears in March, but user asks for 1Y.
    snap(db, acct.id, "2026-03-01", "X", 1000);
    snap(db, acct.id, "2026-04-30", "X", 1100);

    const view = await loadHomeView({
      db,
      period: "1Y",
      today: "2026-04-30",
    });
    const summary = view.accounts[0];
    expect(summary.clamped).toBe(true);
    expect(summary.effectiveStart?.date).toBe("2026-03-01");
    expect(summary.twr).toBeCloseTo(0.1, 4);
  });

  it("returns null TWR for an account with insufficient snapshots in the period", async () => {
    const db = makeDb();
    const acct = upsertAccount(db, { externalId: "100", label: "Sparse" });
    setSeed(db, "100", "2026-04-30", 1000);
    snap(db, acct.id, "2026-04-30", "X", 1000);

    const view = await loadHomeView({
      db,
      period: "1M",
      today: "2026-04-30",
    });
    expect(view.accounts[0].twr).toBeNull();
    // No valid TWR contributors → total TWR is also null.
    expect(view.total.twr).toBeNull();
    // But NAV still reported.
    expect(view.total.nav).toBe(1000);
  });

  it("uses 1M as the default period", async () => {
    const db = makeDb();
    upsertAccount(db, { externalId: "100", label: "Demo" });
    const view = await loadHomeView({ db, today: "2026-05-01" });
    expect(view.period.key).toBe("1M");
  });

  it("treats accounts with snapshots but no transactions as having data", async () => {
    const db = makeDb();
    const acct = upsertAccount(db, { externalId: "100", label: "SnapOnly" });
    snap(db, acct.id, "2026-04-30", "X", 1234);

    const view = await loadHomeView({ db, today: "2026-04-30" });
    expect(view.accounts[0].hasData).toBe(true);
    expect(view.accounts[0].nav).toBe(1234);
  });

  it("recognizes external transfers as flows and excludes them from TWR", async () => {
    const db = makeDb();
    const acct = upsertAccount(db, { externalId: "200", label: "Flow" });
    setSeed(db, "200", "2026-01-01", 10000);
    snap(db, acct.id, "2026-01-01", "ACME", 10000);
    // Mid-period $5k deposit; ending NAV reflects it.
    insertTransaction(
      db,
      acct.id,
      {
        tradeDate: "2026-02-15",
        actionCanonical: "TRANSFER_IN",
        actionRaw: "MoneyLink Transfer",
        symbol: null,
        description: null,
        quantity: null,
        price: null,
        fees: null,
        amount: 5000,
        raw: {},
      },
      "tx.csv",
    );
    snap(db, acct.id, "2026-04-30", "ACME", 16000);

    const view = await loadHomeView({
      db,
      period: "All",
      today: "2026-04-30",
    });
    const t = view.accounts[0].twr;
    expect(t).not.toBeNull();
    // Without flow handling: (16000-10000)/10000 = 0.60. With flow handling
    // the deposit's denominator weight reduces the effective return to
    // somewhere near (16000 - 10000 - 5000) / (10000 + weighted 5000) ≈ ~9-10%.
    // Confirm the engine actually netted the flow out (TWR < raw NAV change).
    expect(t!).toBeLessThan(0.60);
    expect(t!).toBeGreaterThan(0);
  });
});
