import type { Db } from "@/lib/db/connect";

export function getSetting(db: Db, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString());
}

export function getBoolSetting(db: Db, key: string, fallback = false): boolean {
  const v = getSetting(db, key);
  if (v === null) return fallback;
  return v === "true";
}

export function setBoolSetting(db: Db, key: string, value: boolean): void {
  setSetting(db, key, value ? "true" : "false");
}
