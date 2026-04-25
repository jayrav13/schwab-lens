import path from "node:path";
import { openDb } from "@/lib/db/connect";
import { formatAccountShow } from "@/lib/scripts/accountShow";

function parseArgs(argv: string[]): { account: string } {
  let account = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const key = eq >= 0 ? a.slice(0, eq) : a;
    const val = eq >= 0 ? a.slice(eq + 1) : argv[++i];
    switch (key) {
      case "--account": account = val; break;
      default:
        throw new Error(`account-show: unknown flag ${key}`);
    }
  }
  if (!account) throw new Error("account-show: --account is required");
  return { account };
}

function main(): void {
  const { account } = parseArgs(process.argv.slice(2));
  const dbPath = path.join(process.cwd(), "data", "portfolio.db");
  const db = openDb(dbPath);
  try {
    console.log(formatAccountShow(db, account));
  } finally {
    db.close();
  }
}

main();
