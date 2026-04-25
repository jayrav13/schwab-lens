import Papa from "papaparse";
import { parseCurrency } from "@/lib/util/money";
import type {
  PositionsSnapshot,
  SnapshotOption,
  SnapshotShare,
} from "@/lib/positions/types";

const OPTION_SYMBOL =
  /^([A-Z.]+)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+([0-9]+(?:\.[0-9]+)?)\s+([PC])$/;

const ASOF_REGEX =
  /as of (\d{1,2}):(\d{2}) (AM|PM) ET, (\d{4})\/(\d{2})\/(\d{2})/i;

function parseAsOf(headerLine: string): string {
  const m = headerLine.match(ASOF_REGEX);
  if (!m) {
    throw new Error(
      `parsePositionsCsv: cannot parse "as of" timestamp from header: ${headerLine}`,
    );
  }
  const [, hhRaw, mm, ampm, yyyy, mo, dd] = m;
  let hh = Number(hhRaw);
  if (ampm.toUpperCase() === "PM" && hh !== 12) hh += 12;
  if (ampm.toUpperCase() === "AM" && hh === 12) hh = 0;
  return `${yyyy}-${mo}-${dd}T${String(hh).padStart(2, "0")}:${mm}`;
}

function parseNumericCell(raw: string | undefined): number {
  if (raw === undefined || raw === "" || raw === "--" || raw === "N/A") return 0;
  if (raw.includes("$")) return parseCurrency(raw);
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) {
    throw new Error(`parsePositionsCsv: cannot parse numeric "${raw}"`);
  }
  return n;
}

function parseOptionSymbol(sym: string): {
  underlying: string;
  expiry: string;
  strike: number;
  callPut: "C" | "P";
} {
  const m = sym.match(OPTION_SYMBOL);
  if (!m) {
    throw new Error(`parsePositionsCsv: cannot parse option symbol "${sym}"`);
  }
  const [, underlying, mm, dd, yyyy, strike, pc] = m;
  return {
    underlying,
    expiry: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
    strike: Number(strike),
    callPut: pc as "C" | "P",
  };
}

function parseDeltaTheta(raw: string | undefined): number | null {
  if (raw === undefined || raw === "" || raw === "--" || raw === "N/A") {
    return null;
  }
  if (raw.includes("$")) return parseCurrency(raw);
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parsePositionsCsv(
  text: string,
  sourceFile: string,
): PositionsSnapshot {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 3) {
    throw new Error("parsePositionsCsv: file too short to be a Positions CSV");
  }

  const asOf = parseAsOf(lines[0]);

  const dataSection = lines.slice(2).join("\n");
  const result = Papa.parse<Record<string, string>>(dataSection.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(
      `parsePositionsCsv: CSV parse error at row ${first.row}: ${first.message}`,
    );
  }

  let cash: number | null = null;
  let totalValue: number | null = null;
  const shares: SnapshotShare[] = [];
  const options: SnapshotOption[] = [];

  for (const row of result.data) {
    const symbol = row["Symbol"] ?? "";
    const assetType = row["Asset Type"] ?? "";
    const mktVal = row["Mkt Val (Market Value)"];
    const qty = row["Qty (Quantity)"];

    if (symbol === "Cash & Cash Investments") {
      cash = parseNumericCell(mktVal);
      continue;
    }
    if (symbol === "Positions Total" || symbol === "Account Total") {
      totalValue = parseNumericCell(mktVal);
      continue;
    }

    if (assetType === "Equity") {
      const quantity = parseNumericCell(qty);
      const marketValue = parseNumericCell(mktVal);
      const totalCost = parseNumericCell(row["Cost Basis"]);
      shares.push({
        ticker: symbol,
        quantity,
        price: parseNumericCell(row["Price"]),
        marketValue,
        costBasis: quantity === 0 ? 0 : totalCost / quantity,
      });
      continue;
    }

    if (assetType === "Option") {
      const parsed = parseOptionSymbol(symbol);
      const quantity = parseNumericCell(qty);
      const delta = parseDeltaTheta(row["Delta"]);
      const theta = parseDeltaTheta(row["Theta"]);
      const intrinsic = parseDeltaTheta(row["Intr Val (Intrinsic Value)"]);
      options.push({
        ...parsed,
        quantity,
        price: parseNumericCell(row["Price"]),
        marketValue: parseNumericCell(mktVal),
        delta,
        theta,
        intrinsicValue: intrinsic,
      });
      continue;
    }
  }

  if (cash === null) {
    throw new Error(
      'parsePositionsCsv: missing "Cash & Cash Investments" row',
    );
  }
  if (totalValue === null) {
    throw new Error(
      'parsePositionsCsv: missing "Positions Total" or "Account Total" row',
    );
  }

  return { asOf, cash, totalValue, shares, options, sourceFile };
}
