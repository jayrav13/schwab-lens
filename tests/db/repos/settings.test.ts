import { describe, it, expect } from "vitest";
import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import {
  getSetting,
  setSetting,
  getBoolSetting,
  setBoolSetting,
} from "@/lib/db/repos/settings";

function freshDb(): Db {
  const db = openDb(":memory:");
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));
  return db;
}

describe("settings repo", () => {
  it("getSetting returns null for missing key", () => {
    expect(getSetting(freshDb(), "missing")).toBeNull();
  });

  it("setSetting then getSetting roundtrips", () => {
    const db = freshDb();
    setSetting(db, "foo", "bar");
    expect(getSetting(db, "foo")).toBe("bar");
  });

  it("setSetting overwrites an existing key", () => {
    const db = freshDb();
    setSetting(db, "k", "1");
    setSetting(db, "k", "2");
    expect(getSetting(db, "k")).toBe("2");
  });

  it("boolean helpers parse 'true'/'false'", () => {
    const db = freshDb();
    setBoolSetting(db, "flag", true);
    expect(getBoolSetting(db, "flag")).toBe(true);
    setBoolSetting(db, "flag", false);
    expect(getBoolSetting(db, "flag")).toBe(false);
  });

  it("getBoolSetting returns the default for missing key", () => {
    const db = freshDb();
    expect(getBoolSetting(db, "missing", true)).toBe(true);
    expect(getBoolSetting(db, "missing", false)).toBe(false);
  });
});
