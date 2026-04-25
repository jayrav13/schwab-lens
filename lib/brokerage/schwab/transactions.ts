import Papa from "papaparse";
import { parseCurrency } from "@/lib/util/money";
import { parseTradeDate } from "@/lib/util/dates";
import type { CanonicalTransaction, ParseInput } from "@/lib/brokerage/types";
import { mapSchwabAction } from "@/lib/brokerage/schwab/actions";

type RawRow = {
  Date: string;
  Action: string;
  Symbol: string;
  Description: string;
  Quantity: string;
  Price: string;
  "Fees & Comm": string;
  Amount: string;
};

export function parseSchwabTransactions(
  input: ParseInput,
): CanonicalTransaction[] {
  const result = Papa.parse<RawRow>(input.content.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(
      `parseSchwabTransactions: CSV parse error at row ${first.row}: ${first.message}`,
    );
  }
  return result.data.map((raw, idx): CanonicalTransaction => {
    try {
      const amount = parseCurrency(raw.Amount);
      const fees = parseCurrency(raw["Fees & Comm"]);
      const quantity = raw.Quantity ? Number(raw.Quantity) : null;
      const price = raw.Price ? parseCurrency(raw.Price) : null;
      return {
        tradeDate: parseTradeDate(raw.Date),
        actionCanonical: mapSchwabAction(raw.Action, amount),
        actionRaw: raw.Action,
        symbol: raw.Symbol ? raw.Symbol : null,
        description: raw.Description ? raw.Description : null,
        quantity,
        price,
        fees,
        amount,
        raw: { ...raw } as Record<string, unknown>,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `parseSchwabTransactions: row ${idx + 2}: ${msg} — raw: ${JSON.stringify(raw)}`,
      );
    }
  });
}
