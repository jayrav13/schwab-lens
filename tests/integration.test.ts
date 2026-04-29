import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { upsertAccount } from "@/lib/db/repos/accounts";
import { loadHome } from "@/lib/server/home";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("loadHome (integration)", () => {
  it("returns an empty accounts list when no accounts exist", async () => {
    const db = makeDb();
    const { accounts, loadedAt } = await loadHome({ db });
    expect(accounts).toEqual([]);
    expect(typeof loadedAt).toBe("string");
  });

  it("returns ingested accounts in deterministic order", async () => {
    const db = makeDb();
    upsertAccount(db, { externalId: "100", label: "Demo Brokerage" });
    upsertAccount(db, { externalId: "200", label: "Demo Roth" });

    const { accounts } = await loadHome({ db });
    expect(accounts).toHaveLength(2);
    const externalIds = accounts.map((a) => a.externalId).sort();
    expect(externalIds).toEqual(["100", "200"]);
    for (const a of accounts) {
      expect(typeof a.uuid).toBe("string");
      expect(a.uuid.length).toBeGreaterThan(0);
      expect(typeof a.lastSeenAt).toBe("string");
    }
  });
});
