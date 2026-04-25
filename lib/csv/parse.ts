import Papa from "papaparse";
import { parseCurrency } from "@/lib/util/money";
import { parseTradeDate } from "@/lib/util/dates";
import type {
  Action,
  OptionLeg,
  RawCsvRow,
  Transaction,
} from "@/lib/csv/types";

const ACTION_MAP: Record<string, Action> = {
  "Sell to Open": "SellToOpen",
  "Buy to Close": "BuyToClose",
  "Expired": "Expired",
  "Assigned": "Assigned",
  "Buy": "Buy",
  "Sell": "Sell",
  "Qualified Dividend": "QualifiedDividend",
  "Bank Interest": "BankInterest",
  "Credit Interest": "CreditInterest",
  "Journal": "Journal",
  "Wire Sent": "WireSent",
  "Misc Cash Entry": "MiscCashEntry",
  "Service Fee": "ServiceFee",
};

function normalizeAction(raw: string): Action {
  return ACTION_MAP[raw] ?? "Unknown";
}

const OPTION_SYMBOL =
  /^([A-Z.]+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+([0-9]+(?:\.[0-9]+)?)\s+([PC])$/;

function parseOptionSymbol(sym: string): OptionLeg | undefined {
  const m = sym.match(OPTION_SYMBOL);
  if (!m) return undefined;
  const [, ticker, mdy, strike, pc] = m;
  return {
    ticker,
    expiry: parseTradeDate(mdy),
    strike: Number(strike),
    type: pc === "P" ? "Put" : "Call",
  };
}

export function parseSchwabCsv(text: string): Transaction[] {
  const result = Papa.parse<RawCsvRow>(text.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(
      `parseSchwabCsv: CSV parse error at row ${first.row}: ${first.message}`,
    );
  }

  return result.data.map((raw, idx) => {
    try {
      const action = normalizeAction(raw.Action);
      const option = parseOptionSymbol(raw.Symbol);
      const ticker = option?.ticker ?? (raw.Symbol || undefined);

      return {
        tradeDate: parseTradeDate(raw.Date),
        action,
        rawAction: raw.Action,
        ticker,
        option,
        quantity: raw.Quantity ? Number(raw.Quantity) : 0,
        price: raw.Price ? parseCurrency(raw.Price) : undefined,
        fees: parseCurrency(raw["Fees & Comm"]),
        amount: parseCurrency(raw.Amount),
        raw,
      } satisfies Transaction;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `parseSchwabCsv: row ${idx + 2}: ${msg} — raw: ${JSON.stringify(raw)}`,
      );
    }
  });
}
