import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";
import { listAccounts, type Account } from "@/lib/db/repos/accounts";

export type HomeData = {
  accounts: Account[];
  loadedAt: string;
};

export interface LoadHomeOpts {
  db?: Database.Database;
}

export async function loadHome(opts: LoadHomeOpts = {}): Promise<HomeData> {
  const db = opts.db ?? getDb();
  const accounts = listAccounts(db);
  return { accounts, loadedAt: new Date().toISOString() };
}
