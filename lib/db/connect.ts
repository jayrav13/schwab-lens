import Database, { type Database as DbType } from "better-sqlite3";

export type Db = DbType;

export function openDb(filename: string): Db {
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  return db;
}
