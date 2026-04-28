import Database from "better-sqlite3";
import path from "node:path";

let instance: Database.Database | null = null;
let instancePath: string | null = null;

export function getDb(dbPath?: string): Database.Database {
  const resolved = dbPath ?? path.join(process.cwd(), "data", "portfolio.db");
  if (instance && instancePath === resolved) return instance;
  if (instance) instance.close();
  instance = new Database(resolved);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instancePath = resolved;
  return instance;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
    instancePath = null;
  }
}
