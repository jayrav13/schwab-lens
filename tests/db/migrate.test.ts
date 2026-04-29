import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runMigrations } from "@/lib/db/migrate";

let migDir: string;

afterEach(() => {
  if (migDir) rmSync(migDir, { recursive: true, force: true });
});

function setupMigrations(files: Record<string, string>): void {
  migDir = mkdtempSync(path.join(os.tmpdir(), "test-migrations-"));
  for (const [name, sql] of Object.entries(files)) {
    writeFileSync(path.join(migDir, name), sql);
  }
}

describe("runMigrations", () => {
  it("creates the migrations table on first run", () => {
    const db = new Database(":memory:");
    setupMigrations({});
    runMigrations(db, migDir);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'")
      .get();
    expect(row).toBeDefined();
  });

  it("applies migrations in filename order", () => {
    const db = new Database(":memory:");
    setupMigrations({
      "001-a.sql": "CREATE TABLE foo (id INTEGER);",
      "002-b.sql": "CREATE TABLE bar (id INTEGER);",
    });
    runMigrations(db, migDir);
    expect(
      (db.prepare("SELECT name FROM migrations ORDER BY id").all() as { name: string }[]).map(
        (r) => r.name,
      ),
    ).toEqual(["001-a.sql", "002-b.sql"]);
  });

  it("is idempotent: re-running applies nothing new", () => {
    const db = new Database(":memory:");
    setupMigrations({ "001-a.sql": "CREATE TABLE foo (id INTEGER);" });
    runMigrations(db, migDir);
    runMigrations(db, migDir);
    expect(db.prepare("SELECT COUNT(*) AS n FROM migrations").get()).toEqual({ n: 1 });
  });

  it("only applies new migrations on subsequent runs", () => {
    const db = new Database(":memory:");
    setupMigrations({ "001-a.sql": "CREATE TABLE foo (id INTEGER);" });
    runMigrations(db, migDir);
    // Add a second migration (write into the same dir)
    writeFileSync(path.join(migDir, "002-b.sql"), "CREATE TABLE bar (id INTEGER);");
    runMigrations(db, migDir);
    expect(db.prepare("SELECT COUNT(*) AS n FROM bar").get()).toEqual({ n: 0 });
  });

  it("returns gracefully when migrations directory does not exist", () => {
    const db = new Database(":memory:");
    const missing = path.join(os.tmpdir(), "missing-migrations-" + Date.now());
    expect(() => runMigrations(db, missing)).not.toThrow();
  });
});

describe("001-initial-schema.sql", () => {
  const SCHEMA_DIR = path.join(process.cwd(), "db", "migrations");

  it("creates all five tables", () => {
    const db = new Database(":memory:");
    runMigrations(db, SCHEMA_DIR);
    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[]
    ).map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "accounts",
        "migrations",
        "position_snapshots",
        "settings",
        "transactions",
      ]),
    );
  });

  it("enforces UNIQUE on accounts.uuid", () => {
    const db = new Database(":memory:");
    runMigrations(db, SCHEMA_DIR);
    const insert = db.prepare(
      "INSERT INTO accounts (uuid, external_id, label, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
    );
    insert.run("u-1", "100", "A", "2026-01-15", "2026-01-15");
    expect(() => insert.run("u-1", "200", "B", "2026-01-15", "2026-01-15")).toThrow(/UNIQUE/);
  });

  it("enforces UNIQUE on transactions.content_hash", () => {
    const db = new Database(":memory:");
    runMigrations(db, SCHEMA_DIR);
    db.prepare(
      "INSERT INTO accounts (uuid, external_id, label, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
    ).run("u-1", "100", "A", "2026-01-15", "2026-01-15");
    const insert = db.prepare(
      `INSERT INTO transactions (account_id, trade_date, action_canonical, action_raw, amount, raw, source_file, content_hash)
       VALUES (1, '2026-01-02', 'BUY', 'Buy', 100, '{}', 'f.csv', ?)`,
    );
    insert.run("hash-1");
    expect(() => insert.run("hash-1")).toThrow(/UNIQUE/);
  });
});
