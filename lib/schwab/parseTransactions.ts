import Papa from "papaparse";
import type { CanonicalTransaction } from "@/lib/schwab/types";
import { canonicalize } from "@/lib/schwab/actions";

interface RawRow {
  Date?: string;
  Action?: string;
  Symbol?: string;
  Description?: string;
  Quantity?: string;
  Price?: string;
  "Fees & Comm"?: string;
  Amount?: string;
}

function parseAmount(s: string | undefined): number | null {
  if (s == null) return null;
  const trimmed = s.trim();
  if (trimmed === "" || trimmed === "--") return null;
  const negParen = trimmed.startsWith("(") && trimmed.endsWith(")");
  const stripped = trimmed.replace(/[()$,]/g, "");
  const n = Number(stripped);
  if (!Number.isFinite(n)) return null;
  return negParen ? -Math.abs(n) : n;
}

function parseTradeDate(s: string | undefined): string | null {
  if (!s) return null;
  const asOf = s.match(/as of (\d{2})\/(\d{2})\/(\d{4})/);
  if (asOf) return `${asOf[3]}-${asOf[1]}-${asOf[2]}`;
  const direct = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (direct) return `${direct[3]}-${direct[1]}-${direct[2]}`;
  return null;
}

export function parseTransactions(
  content: string,
  _sourceFile: string,
): CanonicalTransaction[] {
  const result = Papa.parse<RawRow>(content, {
    header: true,
    skipEmptyLines: true,
  });

  const out: CanonicalTransaction[] = [];
  for (const row of result.data) {
    const tradeDate = parseTradeDate(row.Date);
    if (!tradeDate) continue;
    const amount = parseAmount(row.Amount) ?? 0;
    const actionRaw = (row.Action ?? "").trim();
    const actionCanonical = canonicalize(actionRaw, amount);
    out.push({
      tradeDate,
      actionCanonical,
      actionRaw,
      symbol: row.Symbol?.trim() || null,
      description: row.Description?.trim() || null,
      quantity: parseAmount(row.Quantity),
      price: parseAmount(row.Price),
      fees: parseAmount(row["Fees & Comm"]),
      amount,
      raw: row as Record<string, unknown>,
    });
  }
  return out;
}
