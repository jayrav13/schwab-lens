import type {
  Action,
  RawCsvRow,
  Transaction,
} from "@/lib/csv/types";
import type { PositionSnapshotRow } from "@/lib/db/repos/positionSnapshots";
import type { TransactionRow } from "@/lib/db/repos/transactions";
import type {
  PositionsSnapshot,
  SnapshotShare,
  SnapshotOption,
} from "@/lib/positions/types";
import { parseOptionSymbol } from "@/lib/schwab/optionSymbol";

const ACTION_MAP: Record<string, Action> = {
  BUY: "Buy",
  SELL: "Sell",
  BUY_TO_OPEN: "Buy",
  SELL_TO_OPEN: "SellToOpen",
  BUY_TO_CLOSE: "BuyToClose",
  SELL_TO_CLOSE: "Sell",
  ASSIGNMENT: "Assigned",
  EXERCISE: "Assigned",
  EXPIRATION: "Expired",
  DIVIDEND: "QualifiedDividend",
  INTEREST: "BankInterest",
  FEE: "ServiceFee",
  JOURNAL: "Journal",
  TRANSFER_IN: "Journal",
  TRANSFER_OUT: "WireSent",
};

export function actionFromCanonical(canonical: string): Action {
  return ACTION_MAP[canonical] ?? "Unknown";
}

export function transactionFromRow(row: TransactionRow): Transaction {
  const action = actionFromCanonical(row.action_canonical);
  const optionLeg = parseOptionSymbol(row.symbol);
  const tx: Transaction = {
    tradeDate: row.trade_date,
    action,
    quantity: row.quantity ?? 0,
    fees: row.fees ?? 0,
    amount: row.amount,
    raw: parseRaw(row.raw),
    rawAction: row.action_raw,
  };
  if (row.price !== null) tx.price = row.price;
  if (optionLeg) {
    tx.option = optionLeg;
  } else if (row.symbol) {
    tx.ticker = row.symbol;
  }
  return tx;
}

function parseRaw(raw: string): RawCsvRow {
  try {
    return JSON.parse(raw) as RawCsvRow;
  } catch {
    return {
      Date: "",
      Action: "",
      Symbol: "",
      Description: "",
      Quantity: "",
      Price: "",
      "Fees & Comm": "",
      Amount: "",
    };
  }
}

export function positionsSnapshotFromRows(
  asOf: string,
  rows: PositionSnapshotRow[],
): PositionsSnapshot {
  const shares: SnapshotShare[] = [];
  const options: SnapshotOption[] = [];
  let cash = 0;
  let totalValue = 0;

  for (const row of rows) {
    const mv = row.market_value ?? 0;
    totalValue += mv;
    if (row.asset_type === "cash") {
      cash += mv;
      continue;
    }
    if (row.asset_type === "option") {
      const leg = parseOptionSymbol(row.symbol);
      if (!leg) continue;
      options.push({
        underlying: leg.ticker,
        expiry: leg.expiry,
        strike: leg.strike,
        callPut: leg.type === "Call" ? "C" : "P",
        quantity: row.quantity ?? 0,
        price: row.price ?? 0,
        marketValue: mv,
        delta: null,
        theta: null,
        intrinsicValue: null,
      });
      continue;
    }
    shares.push({
      ticker: row.symbol,
      quantity: row.quantity ?? 0,
      price: row.price ?? 0,
      marketValue: mv,
      costBasis: row.cost_basis ?? 0,
    });
  }

  return {
    asOf,
    cash,
    totalValue,
    shares,
    options,
    sourceFile: rows[0]?.source_file ?? "",
  };
}
