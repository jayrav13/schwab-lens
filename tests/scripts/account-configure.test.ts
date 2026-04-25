import { describe, it, expect } from "vitest";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount, getAccountByExternal } from "@/lib/db/repos/accounts";
import { getSetting, getBoolSetting } from "@/lib/db/repos/settings";
import { configureAccount } from "@/lib/scripts/accountConfigure";

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "Original" });
  return db;
}

describe("configureAccount", () => {
  it("sets seedDate, seedValue, label, benchmark", () => {
    const db = freshDb();
    configureAccount(db, {
      account: "schwab:999",
      seedDate: "2026-01-15",
      seedValue: 12345,
      label: "Renamed",
      benchmark: "SPY",
    });
    const got = getAccountByExternal(db, "schwab", "999");
    expect(got?.label).toBe("Renamed");
    expect(got?.seedDate).toBe("2026-01-15");
    expect(got?.seedValue).toBe(12345);
    expect(got?.benchmark).toBe("SPY");
  });

  it("--primary stamps the dashboard.primary_account setting", () => {
    const db = freshDb();
    configureAccount(db, { account: "schwab:999", primary: true });
    expect(getSetting(db, "dashboard.primary_account")).toBe("schwab:999");
  });

  it("marketDataEnabled stamps the market_data.enabled setting", () => {
    const db = freshDb();
    configureAccount(db, { account: "schwab:999", marketDataEnabled: true });
    expect(getBoolSetting(db, "market_data.enabled")).toBe(true);
    configureAccount(db, { account: "schwab:999", marketDataEnabled: false });
    expect(getBoolSetting(db, "market_data.enabled")).toBe(false);
  });

  it("throws when account does not exist", () => {
    const db = freshDb();
    expect(() => configureAccount(db, { account: "schwab:000", label: "X" }))
      .toThrow(/No account/);
  });

  it("throws on malformed --account", () => {
    const db = freshDb();
    expect(() => configureAccount(db, { account: "bad-format" })).toThrow(/--account/);
  });
});
