import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";
import { getSetting, setSetting, getBoolean, setBoolean } from "@/lib/db/repos/settings";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("settings repo", () => {
  it("returns null for missing key", () => {
    expect(getSetting(makeDb(), "missing")).toBeNull();
  });

  it("set then get round-trips", () => {
    const db = makeDb();
    setSetting(db, "k", "v");
    expect(getSetting(db, "k")).toBe("v");
  });

  it("set overwrites existing value", () => {
    const db = makeDb();
    setSetting(db, "k", "a");
    setSetting(db, "k", "b");
    expect(getSetting(db, "k")).toBe("b");
  });

  it("getBoolean / setBoolean round-trip", () => {
    const db = makeDb();
    setBoolean(db, "flag", true);
    expect(getBoolean(db, "flag")).toBe(true);
    setBoolean(db, "flag", false);
    expect(getBoolean(db, "flag")).toBe(false);
  });

  it("getBoolean returns false for missing key", () => {
    expect(getBoolean(makeDb(), "missing")).toBe(false);
  });
});
