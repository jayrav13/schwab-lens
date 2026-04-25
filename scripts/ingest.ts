import path from "node:path";
import { mkdirSync } from "node:fs";
import { openDb } from "@/lib/db/connect";
import { runIngest } from "@/lib/ingest/run";

function main(): void {
  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "portfolio.db");
  const db = openDb(dbPath);
  try {
    const summary = runIngest(db, dataDir);
    console.log("== ingest summary ==");
    console.log(`files processed: ${summary.filesProcessed}`);
    console.log(`files skipped:   ${summary.filesSkipped}`);
    console.log(`accounts touched: ${summary.accountsTouched}`);
    console.log(`transactions inserted: ${summary.transactionsInserted}, skipped: ${summary.transactionsSkipped}`);
    console.log(`snapshots inserted:    ${summary.snapshotsInserted}, skipped: ${summary.snapshotsSkipped}`);
    if (summary.unmappedActions.length > 0) {
      console.log("\nunmapped actions (consider extending the mapping table):");
      for (const u of summary.unmappedActions) console.log(`  ${u.actionRaw}: ${u.count}`);
    }
    if (summary.errors.length > 0) {
      console.log("\nerrors:");
      for (const e of summary.errors) console.log(`  [${e.file}] ${e.message}`);
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}

main();
