import path from "node:path";
import { openDb } from "@/lib/db/connect";
import { configureAccount, type ConfigureInput } from "@/lib/scripts/accountConfigure";

function parseRate(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) {
    const n = Number(trimmed.slice(0, -1)) / 100;
    if (!Number.isFinite(n)) {
      throw new Error(`account-configure: cannot parse --expected-real-return ${raw}`);
    }
    return n;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    throw new Error(`account-configure: cannot parse --expected-real-return ${raw}`);
  }
  if (n >= 1) {
    console.error(
      `account-configure: WARNING — --expected-real-return=${n} interpreted as ${n * 100}% per year. ` +
        `If you meant ${n}%, pass --expected-real-return=${n}% instead. Proceeding with literal value.`,
    );
  }
  return n;
}

function parseArgs(argv: string[]): ConfigureInput {
  const out: ConfigureInput = { account: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const key = eq >= 0 ? a.slice(0, eq) : a;
    const val = eq >= 0 ? a.slice(eq + 1) : argv[++i];
    switch (key) {
      case "--account":              out.account = val; break;
      case "--seed-date":            out.seedDate = val; break;
      case "--seed-value":           out.seedValue = Number(val); break;
      case "--label":                out.label = val; break;
      case "--benchmark":            out.benchmark = val; break;
      case "--primary":              out.primary = true; i--; break;
      case "--market-data":          out.marketDataEnabled = val === "on" || val === "true"; break;
      case "--expected-real-return": out.expectedRealReturn = parseRate(val); break;
      case "--target":               out.targetValue = Number(val); break;
      case "--group":                out.accountGroup = val; break;
      default:
        throw new Error(`account-configure: unknown flag ${key}`);
    }
  }
  if (!out.account) throw new Error("account-configure: --account is required");
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = path.join(process.cwd(), "data", "portfolio.db");
  const db = openDb(dbPath);
  try {
    configureAccount(db, args);
    console.log(`configured ${args.account}`);
  } finally {
    db.close();
  }
}

main();
