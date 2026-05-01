import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/connection";
import {
  getAccountByExternalId,
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

export type CliFlags = {
  account?: string;
  seedDate?: Choice<string>;
  seedValue?: Choice<number>;
  benchmark?: Choice<string>;
};

export function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq < 0) throw new Error(`expected --key=value, got "${arg}"`);
    const key = arg.slice(2, eq);
    const value = arg.slice(eq + 1);
    switch (key) {
      case "account":
        flags.account = value;
        break;
      case "seed-date":
        flags.seedDate = parseDate(value);
        break;
      case "seed-value":
        flags.seedValue = parseMoney(value);
        break;
      case "benchmark":
        flags.benchmark = parseTicker(value);
        break;
      default:
        throw new Error(`unknown flag --${key}`);
    }
  }
  return flags;
}

export function configureNonInteractive(
  flags: CliFlags,
  dbOverride?: Database.Database,
): void {
  if (flags.account === undefined) {
    throw new Error("--account is required for non-interactive mode");
  }
  if (
    flags.seedDate === undefined &&
    flags.seedValue === undefined &&
    flags.benchmark === undefined
  ) {
    throw new Error(
      "non-interactive mode requires at least one of --seed-date, --seed-value, --benchmark",
    );
  }

  const db = dbOverride ?? getDb();
  const account = getAccountByExternalId(db, flags.account);
  if (!account) {
    throw new Error(
      `account with external_id="${flags.account}" not found — run \`npm run ingest\` first or check the id`,
    );
  }

  if (flags.seedDate !== undefined || flags.seedValue !== undefined) {
    const dateChoice = flags.seedDate ?? { kind: "keep" };
    const valueChoice = flags.seedValue ?? { kind: "keep" };
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
  }

  if (flags.benchmark !== undefined) {
    const next =
      flags.benchmark.kind === "set" ? flags.benchmark.value : null;
    setBenchmark(db, account.externalId, next);
  }

  const after = getAccountByExternalId(db, flags.account);
  console.log(`Updated ${account.label} (external_id ${account.externalId}):`);
  console.log(`  ${after ? fmtCurrent(after) : "(not found after update)"}`);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  if (Object.keys(flags).length > 0) {
    configureNonInteractive(flags);
    return;
  }

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
