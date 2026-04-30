import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { getDb } from "@/lib/db/connection";
import {
  listAccounts,
  setBenchmark,
  setSeed,
  type Account,
} from "@/lib/db/repos/accounts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Choice<T> = { kind: "keep" } | { kind: "clear" } | { kind: "set"; value: T };

function parseDate(raw: string): Choice<string> {
  const v = raw.trim();
  if (v === "") return { kind: "keep" };
  if (v === "-") return { kind: "clear" };
  if (!ISO_DATE.test(v)) throw new Error(`expected YYYY-MM-DD, got "${v}"`);
  return { kind: "set", value: v };
}

function parseMoney(raw: string): Choice<number> {
  const v = raw.trim();
  if (v === "") return { kind: "keep" };
  if (v === "-") return { kind: "clear" };
  const n = Number(v.replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`expected non-negative number, got "${v}"`);
  }
  return { kind: "set", value: n };
}

function parseTicker(raw: string): Choice<string> {
  const v = raw.trim();
  if (v === "") return { kind: "keep" };
  if (v === "-") return { kind: "clear" };
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/i.test(v)) {
    throw new Error(`expected ticker symbol, got "${v}"`);
  }
  return { kind: "set", value: v.toUpperCase() };
}

function fmtCurrent(account: Account): string {
  const d = account.seedDate ?? "(none)";
  const v = account.seedValue !== null ? `$${account.seedValue.toFixed(2)}` : "(none)";
  const b = account.benchmark ?? "(none)";
  return `seed_date=${d}, seed_value=${v}, benchmark=${b}`;
}

async function configureOne(
  rl: readline.Interface,
  account: Account,
  index: number,
  total: number,
): Promise<{ touched: boolean }> {
  console.log(`\n[${index + 1}/${total}] ${account.label} (external_id ${account.externalId})`);
  console.log(`  Current: ${fmtCurrent(account)}`);

  const dateRaw = await rl.question("  Seed date (YYYY-MM-DD, blank=keep, - to clear): ");
  const valueRaw = await rl.question("  Seed value (USD, blank=keep, - to clear): ");
  const benchRaw = await rl.question('  Benchmark ticker (e.g. SPY, blank=keep, - to clear): ');

  const dateChoice = parseDate(dateRaw);
  const valueChoice = parseMoney(valueRaw);
  const benchChoice = parseTicker(benchRaw);

  const db = getDb();
  let touched = false;

  if (dateChoice.kind !== "keep" || valueChoice.kind !== "keep") {
    const nextDate =
      dateChoice.kind === "set"
        ? dateChoice.value
        : dateChoice.kind === "clear"
          ? null
          : account.seedDate;
    const nextValue =
      valueChoice.kind === "set"
        ? valueChoice.value
        : valueChoice.kind === "clear"
          ? null
          : account.seedValue;
    setSeed(db, account.externalId, nextDate, nextValue);
    touched = true;
  }

  if (benchChoice.kind !== "keep") {
    const next = benchChoice.kind === "set" ? benchChoice.value : null;
    setBenchmark(db, account.externalId, next);
    touched = true;
  }

  if (touched) console.log("  ✓ Updated.");
  else console.log("  (no change)");

  return { touched };
}

async function main() {
  const db = getDb();
  const accounts = listAccounts(db);

  if (accounts.length === 0) {
    console.log("No accounts in DB. Run `npm run ingest` first.");
    return;
  }

  console.log(`Schwab Lens — account configuration`);
  console.log(`Found ${accounts.length} account(s).`);

  const rl = readline.createInterface({ input, output });
  let updated = 0;
  try {
    for (let i = 0; i < accounts.length; i++) {
      const { touched } = await configureOne(rl, accounts[i], i, accounts.length);
      if (touched) updated++;
    }
  } finally {
    rl.close();
  }

  console.log(`\nDone. ${updated} of ${accounts.length} account(s) updated.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
