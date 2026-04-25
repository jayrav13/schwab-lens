import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseSchwabCsv } from "@/lib/csv/parse";
import type { Transaction } from "@/lib/csv/types";

function dedupKey(t: Transaction): string {
  return [
    t.tradeDate,
    t.rawAction,
    t.raw.Symbol ?? "",
    t.raw.Quantity ?? "",
    t.raw.Amount ?? "",
  ].join("|");
}

export function loadTransactionsFromDir(dir: string): Transaction[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) =>
    f.toLowerCase().endsWith(".csv"),
  );

  const seen = new Map<string, Transaction>();
  for (const f of files) {
    const text = readFileSync(path.join(dir, f), "utf8");
    for (const t of parseSchwabCsv(text)) {
      const key = dedupKey(t);
      if (!seen.has(key)) seen.set(key, t);
    }
  }

  const all = Array.from(seen.values());
  all.sort((a, b) =>
    a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0,
  );
  return all;
}
