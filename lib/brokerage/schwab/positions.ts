import Papa from "papaparse";
import { parseCurrency } from "@/lib/util/money";
import type {
  CanonicalPositionSnapshot,
  AssetType,
  ParseInput,
} from "@/lib/brokerage/types";

const ASOF_REGEX =
  /as of\s+\d{1,2}:\d{2}\s+(?:AM|PM)\s+ET,\s+(\d{4})\/(\d{2})\/(\d{2})/i;

function parseAsOf(headerLine: string): string {
  const m = headerLine.match(ASOF_REGEX);
  if (!m) {
    throw new Error(
      `parseSchwabPositions: cannot parse "as of" timestamp from header: ${headerLine}`,
    );
  }
  const [, yyyy, mo, dd] = m;
  return `${yyyy}-${mo}-${dd}`;
}

function parseNumeric(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "--" || trimmed === "N/A") return null;
  if (trimmed.includes("$")) return parseCurrency(trimmed);
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function classifyAssetType(raw: string | undefined): AssetType | null {
  switch ((raw ?? "").trim()) {
    case "Equity": return "equity";
    case "Option": return "option";
    case "Cash":   return "cash";
    default:       return null;
  }
}

const SKIP_SYMBOLS = new Set(["Account Total", "Positions Total"]);

export function parseSchwabPositions(
  input: ParseInput,
): CanonicalPositionSnapshot[] {
  const lines = input.content.replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 3) {
    throw new Error("parseSchwabPositions: file too short to be a Positions CSV");
  }
  const asOf = parseAsOf(lines[0]);
  const dataSection = lines.slice(2).join("\n").trim();

  const result = Papa.parse<Record<string, string>>(dataSection, {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(
      `parseSchwabPositions: CSV parse error at row ${first.row}: ${first.message}`,
    );
  }

  const out: CanonicalPositionSnapshot[] = [];
  for (const row of result.data) {
    const symbol = (row["Symbol"] ?? "").trim();
    if (symbol === "" || SKIP_SYMBOLS.has(symbol)) continue;
    out.push({
      asOf,
      symbol,
      description: row["Description"] ? row["Description"] : null,
      quantity: parseNumeric(row["Qty (Quantity)"]),
      price: parseNumeric(row["Price"]),
      marketValue: parseNumeric(row["Mkt Val (Market Value)"]),
      costBasis: parseNumeric(row["Cost Basis"]),
      assetType: classifyAssetType(row["Asset Type"]),
      raw: { ...row } as Record<string, unknown>,
    });
  }
  return out;
}
