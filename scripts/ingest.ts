import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import {
  upsertAccount,
  getAccountByExternalId,
  setSeed,
  setBenchmark,
} from "@/lib/db/repos/accounts";
import { insertTransaction } from "@/lib/db/repos/transactions";
import { insertSnapshot } from "@/lib/db/repos/positionSnapshots";
import { setSetting } from "@/lib/db/repos/settings";
import {
  identifyTransactions,
  identifyPositions,
} from "@/lib/schwab/identify";
import { parseTransactions } from "@/lib/schwab/parseTransactions";
import { parsePositions } from "@/lib/schwab/parsePositions";

export interface IngestSummary {
  filesProcessed: number;
  filesSkipped: number;
  rowsInserted: number;
  rowsSkippedDuplicate: number;
  accountsTouched: string[];
  warnings: string[];
}

export interface IngestOptions {
  db: Database.Database;
  dataDir: string;
}

export async function ingest(opts: IngestOptions): Promise<IngestSummary> {
  const { db, dataDir } = opts;
  const summary: IngestSummary = {
    filesProcessed: 0,
    filesSkipped: 0,
    rowsInserted: 0,
    rowsSkippedDuplicate: 0,
    accountsTouched: [],
    warnings: [],
  };

  runMigrations(db, path.join(process.cwd(), "db", "migrations"));

  const pendingConfigMigration = readPendingConfigMigration(db, dataDir);

  const txDir = path.join(dataDir, "transactions");
  const posDir = path.join(dataDir, "positions");

  for (const f of safeReaddir(txDir).filter((f) => f.endsWith(".csv"))) {
    const filepath = path.join(txDir, f);
    const identity = identifyTransactions(filepath);
    if (!identity) {
      summary.filesSkipped++;
      summary.warnings.push(`Skipped (no identity): ${f}`);
      continue;
    }
    upsertAccount(db, { externalId: identity.externalId, label: identity.label });
    const account = getAccountByExternalId(db, identity.externalId)!;
    if (!summary.accountsTouched.includes(identity.externalId)) {
      summary.accountsTouched.push(identity.externalId);
    }
    const content = readFileSync(filepath, "utf8");
    for (const tx of parseTransactions(content)) {
      const { inserted } = insertTransaction(db, account.id, tx, f);
      if (inserted) summary.rowsInserted++;
      else summary.rowsSkippedDuplicate++;
    }
    summary.filesProcessed++;
  }

  for (const f of safeReaddir(posDir).filter((f) => f.endsWith(".csv"))) {
    const filepath = path.join(posDir, f);
    const content = readFileSync(filepath, "utf8");
    const identity = identifyPositions(filepath, content);
    if (!identity) {
      summary.filesSkipped++;
      summary.warnings.push(`Skipped (no identity): ${f}`);
      continue;
    }
    if (identity.mismatchWarning) summary.warnings.push(identity.mismatchWarning);
    upsertAccount(db, { externalId: identity.externalId, label: identity.label });
    const account = getAccountByExternalId(db, identity.externalId)!;
    if (!summary.accountsTouched.includes(identity.externalId)) {
      summary.accountsTouched.push(identity.externalId);
    }
    for (const snap of parsePositions(content, f, identity.asOf)) {
      const { inserted } = insertSnapshot(db, account.id, snap, f);
      if (inserted) summary.rowsInserted++;
      else summary.rowsSkippedDuplicate++;
    }
    summary.filesProcessed++;
  }

  if (pendingConfigMigration && summary.accountsTouched.length > 0) {
    applyPendingConfigMigration(db, summary, pendingConfigMigration);
  }

  return summary;
}

interface PendingConfigMigration {
  seedDate: string | null;
  seedValue: number | null;
  benchmark: string | null;
}

function readPendingConfigMigration(
  db: Database.Database,
  dataDir: string,
): PendingConfigMigration | null {
  const configPath = path.join(dataDir, "config.json");
  if (!existsSync(configPath)) return null;

  const alreadyMigrated = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("_meta.config_json_migrated") as { value: string } | undefined;
  if (alreadyMigrated?.value === "true") return null;

  try {
    const json = JSON.parse(readFileSync(configPath, "utf8"));
    return {
      seedDate: typeof json.seedDate === "string" ? json.seedDate : null,
      seedValue: typeof json.seedValue === "number" ? json.seedValue : null,
      benchmark: typeof json.benchmark === "string" ? json.benchmark : null,
    };
  } catch {
    return null;
  }
}

function applyPendingConfigMigration(
  db: Database.Database,
  summary: IngestSummary,
  pending: PendingConfigMigration,
): void {
  const firstExternalId = summary.accountsTouched[0];
  if (pending.seedDate || pending.seedValue !== null) {
    setSeed(db, firstExternalId, pending.seedDate, pending.seedValue);
  }
  if (pending.benchmark) {
    setBenchmark(db, firstExternalId, pending.benchmark);
  }
  setSetting(db, "_meta.config_json_migrated", "true");
  summary.warnings.push(
    `Migrated data/config.json into account ${firstExternalId}. You can now delete data/config.json.`,
  );
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
