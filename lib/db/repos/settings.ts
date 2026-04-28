import type Database from "better-sqlite3";

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(
  db: Database.Database,
  key: string,
  value: string,
): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, new Date().toISOString());
}

export function getBoolean(db: Database.Database, key: string): boolean {
  return getSetting(db, key) === "true";
}

export function setBoolean(
  db: Database.Database,
  key: string,
  value: boolean,
): void {
  setSetting(db, key, value ? "true" : "false");
}
