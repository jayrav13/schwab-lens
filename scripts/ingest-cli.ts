import path from "node:path";
import { getDb } from "@/lib/db/connection";
import { ingest } from "@/scripts/ingest";
import { unknownActionTally } from "@/lib/db/repos/transactions";

async function main() {
  const dataDir = path.join(process.cwd(), "data");
  const db = getDb();
  const summary = await ingest({ db, dataDir });

  console.log("Ingest summary:");
  console.log(`  Files processed:        ${summary.filesProcessed}`);
  console.log(`  Files skipped:          ${summary.filesSkipped}`);
  console.log(`  Rows inserted:          ${summary.rowsInserted}`);
  console.log(`  Rows skipped (dup):     ${summary.rowsSkippedDuplicate}`);
  console.log(`  Accounts touched:       ${summary.accountsTouched.join(", ") || "(none)"}`);
  if (summary.warnings.length > 0) {
    console.log("  Warnings:");
    for (const w of summary.warnings) console.log(`    - ${w}`);
  }
  const unknowns = unknownActionTally(db);
  if (unknowns.length > 0) {
    console.log("  Unmapped action types:");
    for (const u of unknowns) console.log(`    - ${u.actionRaw}: ${u.count}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
