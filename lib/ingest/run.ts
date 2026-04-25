import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import type { Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import { brokerages, findBrokerage } from "@/lib/brokerage/registry";
import {
  upsertAccount,
  updateAccountSeed,
} from "@/lib/db/repos/accounts";
import {
  insertTransactions,
  countDistinctUnknownActions,
} from "@/lib/db/repos/transactions";
import {
  insertPositionSnapshots,
  listEarliestSnapshot,
} from "@/lib/db/repos/positionSnapshots";
import {
  hashTransaction,
  hashSnapshot,
} from "@/lib/ingest/contentHash";

export type IngestSummary = {
  filesProcessed: number;
  filesSkipped: number;
  accountsTouched: number;
  transactionsInserted: number;
  transactionsSkipped: number;
  snapshotsInserted: number;
  snapshotsSkipped: number;
  unmappedActions: Array<{ actionRaw: string; count: number }>;
  errors: Array<{ file: string; message: string }>;
};

const SUPPORTED_KINDS = ["transactions", "positions"] as const;
type Kind = (typeof SUPPORTED_KINDS)[number];

type DiscoveredFile = {
  brokerageSlug: string;
  externalId: string;
  kind: Kind;
  filepath: string;
};

function discoverFiles(dataDir: string): DiscoveredFile[] {
  if (!existsSync(dataDir)) return [];
  const out: DiscoveredFile[] = [];
  for (const brokerage of brokerages) {
    const broDir = path.join(dataDir, brokerage.slug);
    if (!existsSync(broDir) || !statSync(broDir).isDirectory()) continue;
    for (const externalId of readdirSync(broDir)) {
      const acctDir = path.join(broDir, externalId);
      if (!statSync(acctDir).isDirectory()) continue;
      for (const kind of SUPPORTED_KINDS) {
        const kindDir = path.join(acctDir, kind);
        if (!existsSync(kindDir)) continue;
        for (const f of readdirSync(kindDir)) {
          if (!f.toLowerCase().endsWith(".csv")) continue;
          out.push({
            brokerageSlug: brokerage.slug,
            externalId,
            kind,
            filepath: path.join(kindDir, f),
          });
        }
      }
    }
  }
  return out;
}

export function runIngest(db: Db, dataDir: string): IngestSummary {
  runMigrations(db, path.join(process.cwd(), "db", "migrations"));

  const files = discoverFiles(dataDir).sort((a, b) =>
    a.filepath < b.filepath ? -1 : 1,
  );

  const summary: IngestSummary = {
    filesProcessed: 0,
    filesSkipped: 0,
    accountsTouched: 0,
    transactionsInserted: 0,
    transactionsSkipped: 0,
    snapshotsInserted: 0,
    snapshotsSkipped: 0,
    unmappedActions: [],
    errors: [],
  };

  const touchedAccounts = new Set<number>();

  for (const f of files) {
    try {
      const adapter = findBrokerage(f.brokerageSlug);
      if (!adapter) {
        summary.filesSkipped++;
        summary.errors.push({ file: f.filepath, message: `Unknown brokerage: ${f.brokerageSlug}` });
        continue;
      }

      const content = readFileSync(f.filepath, "utf8");
      const identity = adapter.identify({ filepath: f.filepath, content });

      if (identity.externalId !== f.externalId) {
        summary.filesSkipped++;
        summary.errors.push({
          file: f.filepath,
          message: `Path says external_id=${f.externalId} but file content says ${identity.externalId}`,
        });
        continue;
      }

      const accountId = upsertAccount(db, {
        brokerageSlug: f.brokerageSlug,
        externalId: identity.externalId,
        label: identity.label,
      });
      touchedAccounts.add(accountId);

      if (f.kind === "transactions") {
        const rows = adapter.parseTransactions({ filepath: f.filepath, content });
        const insertable = rows.map((r) => ({
          ...r,
          sourceFile: path.basename(f.filepath),
          contentHash: hashTransaction(f.brokerageSlug, identity.externalId, r),
        }));
        const result = insertTransactions(db, accountId, insertable);
        summary.transactionsInserted += result.inserted;
        summary.transactionsSkipped += result.skipped;
      } else {
        const rows = adapter.parsePositions({ filepath: f.filepath, content });
        const insertable = rows.map((r) => ({
          ...r,
          sourceFile: path.basename(f.filepath),
          contentHash: hashSnapshot(f.brokerageSlug, identity.externalId, r),
        }));
        const result = insertPositionSnapshots(db, accountId, insertable);
        summary.snapshotsInserted += result.inserted;
        summary.snapshotsSkipped += result.skipped;
      }
      summary.filesProcessed++;
    } catch (err) {
      summary.filesSkipped++;
      summary.errors.push({
        file: f.filepath,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const accountId of touchedAccounts) {
    const account = db
      .prepare("SELECT seed_date, seed_value FROM accounts WHERE id = ?")
      .get(accountId) as { seed_date: string | null; seed_value: number | null } | undefined;
    if (!account) continue;
    if (account.seed_date !== null && account.seed_value !== null) continue;

    const earliest = listEarliestSnapshot(db, accountId);
    if (!earliest) continue;
    const seedValue = earliest.rows.reduce((sum, r) => sum + (r.marketValue ?? 0), 0);
    updateAccountSeed(db, accountId, earliest.asOf, seedValue);
  }

  summary.accountsTouched = touchedAccounts.size;
  summary.unmappedActions = countDistinctUnknownActions(db);
  return summary;
}
