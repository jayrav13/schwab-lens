import Papa from "papaparse";
import type { AssetType, CanonicalPositionSnapshot } from "@/lib/schwab/types";

interface RawRow {
  Symbol?: string;
  Description?: string;
  "Qty (Quantity)"?: string;
  Price?: string;
  "Mkt Val (Market Value)"?: string;
  "Cost Basis"?: string;
  "Asset Type"?: string;
}

function parseNum(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (t === "" || t === "--") return null;
  const neg = t.startsWith("(") && t.endsWith(")");
  const n = Number(t.replace(/[()$,]/g, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function classifyAssetType(symbol: string, raw: string | undefined): AssetType {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("cash")) return "cash";
  if (t.includes("option")) return "option";
  if (/\d{2}\/\d{2}\/\d{4}\s+[\d.]+\s+[CP]/.test(symbol)) return "option";
  if (t.includes("equity")) return "equity";
  return null;
}

function isTotalsRow(symbol: string): boolean {
  return symbol.trim().toLowerCase().includes("total");
}

export function parsePositions(
  content: string,
  _sourceFile: string,
  asOf: string,
): CanonicalPositionSnapshot[] {
  const lines = content.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith('"Symbol"'));
  if (headerIdx === -1) return [];
  const tableCsv = lines.slice(headerIdx).join("\n");

  const result = Papa.parse<RawRow>(tableCsv, {
    header: true,
    skipEmptyLines: true,
  });

  const out: CanonicalPositionSnapshot[] = [];
  for (const row of result.data) {
    const symbol = row.Symbol?.trim() ?? "";
    if (!symbol) continue;
    if (isTotalsRow(symbol)) continue;

    const isCashRow = symbol.toLowerCase().includes("cash");
    const finalSymbol = isCashRow ? "CASH" : symbol;
    out.push({
      asOf,
      symbol: finalSymbol,
      description: row.Description?.trim() || null,
      quantity: parseNum(row["Qty (Quantity)"]),
      price: parseNum(row.Price),
      marketValue: parseNum(row["Mkt Val (Market Value)"]),
      costBasis: parseNum(row["Cost Basis"]),
      assetType: classifyAssetType(symbol, row["Asset Type"]),
      raw: row as Record<string, unknown>,
    });
  }
  return out;
}
