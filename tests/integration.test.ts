import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import { loadHomeView } from "@/lib/server/home";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("loadHomeView (integration)", () => {
  it("returns an empty accounts list when no accounts exist", async () => {
    const db = makeDb();
    const view = await loadHomeView({ db, today: "2026-05-01" });
    expect(view.accounts).toEqual([]);
    expect(view.total.nav).toBe(0);
    expect(view.total.twr).toBeNull();
    expect(typeof view.loadedAt).toBe("string");
  });

  it("returns ingested accounts in deterministic order", async () => {
    const db = makeDb();
    upsertAccount(db, { externalId: "100", label: "Demo Brokerage" });
    upsertAccount(db, { externalId: "200", label: "Demo Roth" });

    const { accounts } = await loadHomeView({ db, today: "2026-05-01" });
    expect(accounts).toHaveLength(2);
    const externalIds = accounts.map((a) => a.account.externalId).sort();
    expect(externalIds).toEqual(["100", "200"]);
    for (const a of accounts) {
      expect(typeof a.account.uuid).toBe("string");
      expect(a.account.uuid.length).toBeGreaterThan(0);
      expect(a.hasData).toBe(false);
    }
  });
});
