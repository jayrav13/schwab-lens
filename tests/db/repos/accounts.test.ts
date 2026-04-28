import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import {
  upsertAccount,
  getAccountByExternalId,
  getAccountByUuid,
  listAccounts,
} from "@/lib/db/repos/accounts";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("accounts repo", () => {
  it("inserts a new account and generates a UUID", () => {
    const db = makeDb();
    const account = upsertAccount(db, { externalId: "100", label: "Demo" });
    expect(account.externalId).toBe("100");
    expect(account.label).toBe("Demo");
    expect(account.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(account.firstSeenAt).toEqual(account.lastSeenAt);
  });

  it("upsert with same external_id updates label and last_seen_at", () => {
    const db = makeDb();
    const a = upsertAccount(db, { externalId: "100", label: "Demo" });
    const b = upsertAccount(db, { externalId: "100", label: "Demo Renamed" });
    expect(b.id).toBe(a.id);
    expect(b.uuid).toBe(a.uuid);
    expect(b.label).toBe("Demo Renamed");
    expect(b.firstSeenAt).toBe(a.firstSeenAt);
  });

  it("getAccountByExternalId returns null when not found", () => {
    const db = makeDb();
    expect(getAccountByExternalId(db, "999")).toBeNull();
  });

  it("getAccountByUuid round-trips with upsertAccount", () => {
    const db = makeDb();
    const a = upsertAccount(db, { externalId: "100", label: "Demo" });
    const found = getAccountByUuid(db, a.uuid);
    expect(found?.id).toBe(a.id);
  });

  it("listAccounts returns rows in insertion order", () => {
    const db = makeDb();
    upsertAccount(db, { externalId: "100", label: "A" });
    upsertAccount(db, { externalId: "200", label: "B" });
    const all = listAccounts(db);
    expect(all.map((a) => a.externalId)).toEqual(["100", "200"]);
  });
});
