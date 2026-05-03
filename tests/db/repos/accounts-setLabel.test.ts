import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import {
  upsertAccount,
  setLabel,
  getAccountByExternalId,
} from "@/lib/db/repos/accounts";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("setLabel", () => {
  it("updates the label of an existing account", () => {
    const db = makeDb();
    upsertAccount(db, { externalId: "100", label: "Old" });
    setLabel(db, "100", "New");
    expect(getAccountByExternalId(db, "100")?.label).toBe("New");
  });
});
