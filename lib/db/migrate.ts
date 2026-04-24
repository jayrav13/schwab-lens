import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { Db } from "@/lib/db/connect";

const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS migrations (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )
`;

export function splitSqlStatements(sql: string): string[] {
  const stripped = sql.replace(/--[^\n]*/g, "");
  return stripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function runMigrations(db: Db, migrationsDir: string): void {
  db.prepare(CREATE_MIGRATIONS_TABLE).run();

  const files = existsSync(migrationsDir)
    ? readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort()
    : [];

  const appliedRows = db.prepare("SELECT name FROM migrations").all() as Array<{ name: string }>;
  const applied = new Set(appliedRows.map((r) => r.name));

  const insert = db.prepare(
    "INSERT INTO migrations (name, applied_at) VALUES (?, ?)",
  );

  const apply = db.transaction((file: string, sql: string) => {
    for (const stmt of splitSqlStatements(sql)) {
      db.prepare(stmt).run();
    }
    insert.run(file, new Date().toISOString());
  });

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    apply(file, sql);
  }
}
