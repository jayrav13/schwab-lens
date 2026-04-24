import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";

function withMigrationsDir(files: Array<{ name: string; sql: string }>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "migrate-test-"));
  const migDir = path.join(dir, "migrations");
  mkdirSync(migDir);
  for (const f of files) writeFileSync(path.join(migDir, f.name), f.sql);
  return migDir;
}

describe("runMigrations", () => {
  it("creates the migrations table on first run", () => {
    const db = openDb(":memory:");
    const migDir = withMigrationsDir([]);
    runMigrations(db, migDir);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'")
      .get();
    expect(row).toBeDefined();
  });

  it("applies a single SQL migration and records it", () => {
    const db = openDb(":memory:");
    const migDir = withMigrationsDir([
      { name: "001-create-foo.sql", sql: "CREATE TABLE foo (id INTEGER PRIMARY KEY);" },
    ]);
    runMigrations(db, migDir);

    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='foo'")
      .get();
    expect(tableExists).toBeDefined();

    const applied = db.prepare("SELECT name FROM migrations").all() as Array<{ name: string }>;
    expect(applied.map((r) => r.name)).toEqual(["001-create-foo.sql"]);
  });

  it("is idempotent (re-running applies nothing)", () => {
    const db = openDb(":memory:");
    const migDir = withMigrationsDir([
      { name: "001-create-foo.sql", sql: "CREATE TABLE foo (id INTEGER PRIMARY KEY);" },
    ]);
    runMigrations(db, migDir);
    runMigrations(db, migDir);
    const applied = db.prepare("SELECT COUNT(*) AS n FROM migrations").get() as { n: number };
    expect(applied.n).toBe(1);
  });

  it("applies migrations in lexicographic order", () => {
    const db = openDb(":memory:");
    const migDir = withMigrationsDir([
      { name: "002-create-bar.sql", sql: "CREATE TABLE bar (id INTEGER PRIMARY KEY);" },
      { name: "001-create-foo.sql", sql: "CREATE TABLE foo (id INTEGER PRIMARY KEY);" },
    ]);
    runMigrations(db, migDir);
    const applied = db.prepare("SELECT name FROM migrations ORDER BY id").all() as Array<{ name: string }>;
    expect(applied.map((r) => r.name)).toEqual(["001-create-foo.sql", "002-create-bar.sql"]);
  });

  it("handles a multi-statement migration file", () => {
    const db = openDb(":memory:");
    const migDir = withMigrationsDir([
      {
        name: "001-multi.sql",
        sql: `
          CREATE TABLE a (id INTEGER PRIMARY KEY);
          CREATE TABLE b (id INTEGER PRIMARY KEY);
          INSERT INTO a (id) VALUES (1);
        `,
      },
    ]);
    runMigrations(db, migDir);
    const aRows = db.prepare("SELECT id FROM a").all() as Array<{ id: number }>;
    const bExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='b'")
      .get();
    expect(aRows.map((r) => r.id)).toEqual([1]);
    expect(bExists).toBeDefined();
  });
});
