import { describe, it, expect } from "vitest";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import {
  upsertAccount,
  getAccountByExternal,
  listAccounts,
  updateAccountSeed,
  updateAccountLabel,
  updateAccountBenchmark,
} from "@/lib/db/repos/accounts";

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("accounts repo", () => {
  it("upsertAccount inserts a new account row", () => {
    const db = freshDb();
    const id = upsertAccount(db, {
      brokerageSlug: "schwab",
      externalId: "999",
      label: "Test",
    });
    expect(id).toBeGreaterThan(0);
    const got = getAccountByExternal(db, "schwab", "999");
    expect(got).toMatchObject({ brokerageSlug: "schwab", externalId: "999", label: "Test" });
    expect(got?.firstSeenAt).toBeTruthy();
    expect(got?.lastSeenAt).toBeTruthy();
  });

  it("upsertAccount on an existing row updates label + last_seen_at, keeps first_seen_at", () => {
    const db = freshDb();
    upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "First", now: "2026-01-15T00:00:00Z" });
    const before = getAccountByExternal(db, "schwab", "999");
    upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "Updated", now: "2026-01-02T00:00:00Z" });
    const after = getAccountByExternal(db, "schwab", "999");
    expect(after?.label).toBe("Updated");
    expect(after?.firstSeenAt).toBe(before?.firstSeenAt);
    expect(after?.lastSeenAt).not.toBe(before?.lastSeenAt);
  });

  it("listAccounts returns all rows", () => {
    const db = freshDb();
    upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "A" });
    upsertAccount(db, { brokerageSlug: "schwab", externalId: "888", label: "B" });
    expect(listAccounts(db)).toHaveLength(2);
  });

  it("updateAccountSeed sets seed_date and seed_value", () => {
    const db = freshDb();
    const id = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "A" });
    updateAccountSeed(db, id, "2026-01-15", 1234.56);
    const got = getAccountByExternal(db, "schwab", "999");
    expect(got?.seedDate).toBe("2026-01-15");
    expect(got?.seedValue).toBe(1234.56);
  });

  it("updateAccountLabel and updateAccountBenchmark set those columns", () => {
    const db = freshDb();
    const id = upsertAccount(db, { brokerageSlug: "schwab", externalId: "999", label: "A" });
    updateAccountLabel(db, id, "Renamed");
    updateAccountBenchmark(db, id, "SPY");
    const got = getAccountByExternal(db, "schwab", "999");
    expect(got?.label).toBe("Renamed");
    expect(got?.benchmark).toBe("SPY");
  });
});
