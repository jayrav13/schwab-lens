import path from "node:path";
import { openDb, type Db } from "@/lib/db/connect";
import { runMigrations } from "@/lib/db/migrate";
import {
  getAccountByExternal,
  type Account,
} from "@/lib/db/repos/accounts";
import {
  listTransactionsByAccount,
  type StoredTransaction,
} from "@/lib/db/repos/transactions";
import {
  listLatestSnapshot,
  listEarliestSnapshot,
  type SnapshotForDate,
} from "@/lib/db/repos/positionSnapshots";
import { getSetting, getBoolSetting } from "@/lib/db/repos/settings";
import { parseOptionSymbol } from "@/lib/util/optionSymbol";
import type { Transaction } from "@/lib/csv/types";
import type { PositionsSnapshot } from "@/lib/positions/types";
import type { CanonicalAction } from "@/lib/brokerage/types";

export type DashboardSource = {
  account: Account;
  transactions: Transaction[];
  earliestSnapshot: PositionsSnapshot | null;
  latestSnapshot: PositionsSnapshot | null;
  marketDataEnabled: boolean;
};

export type DashboardSourceMissing =
  | { kind: "no-primary-account" }
  | { kind: "primary-account-not-found"; account: string };

export function loadDashboardSource(
  db: Db,
): { kind: "ok"; source: DashboardSource } | DashboardSourceMissing {
  const primary = getSetting(db, "dashboard.primary_account");
  if (!primary) return { kind: "no-primary-account" };

  const m = primary.match(/^([a-z]+):([A-Za-z0-9]+)$/);
  if (!m) return { kind: "primary-account-not-found", account: primary };
  const [, brokerageSlug, externalId] = m;

  const account = getAccountByExternal(db, brokerageSlug, externalId);
  if (!account) return { kind: "primary-account-not-found", account: primary };

  return {
    kind: "ok",
    source: {
      account,
      transactions: listTransactionsByAccount(db, account.id).map(toLegacyTx),
      earliestSnapshot: snapshotForDateToLegacy(listEarliestSnapshot(db, account.id)),
      latestSnapshot: snapshotForDateToLegacy(listLatestSnapshot(db, account.id)),
      marketDataEnabled: getBoolSetting(db, "market_data.enabled", false),
    },
  };
}

export function openProductionDb(dataDir?: string, migrationsDir?: string): Db {
  const cwd = process.cwd();
  const resolvedDataDir = dataDir ?? path.join(cwd, "data");
  const resolvedMigDir = migrationsDir ?? path.join(cwd, "db", "migrations");
  const dbPath = path.join(resolvedDataDir, "portfolio.db");
  const db = openDb(dbPath);
  runMigrations(db, resolvedMigDir);
  return db;
}

const ACTION_MAP: Record<CanonicalAction, Transaction["action"]> = {
  BUY: "Buy",
  SELL: "Sell",
  BUY_TO_OPEN: "Unknown",
  SELL_TO_OPEN: "SellToOpen",
  BUY_TO_CLOSE: "BuyToClose",
  SELL_TO_CLOSE: "Unknown",
  ASSIGNMENT: "Assigned",
  EXERCISE: "Unknown",
  EXPIRATION: "Expired",
  DIVIDEND: "QualifiedDividend",
  INTEREST: "BankInterest",
  FEE: "ServiceFee",
  JOURNAL: "Journal",
  TRANSFER_IN: "Journal",
  TRANSFER_OUT: "WireSent",
  UNKNOWN: "Unknown",
};

function toLegacyTx(stored: StoredTransaction): Transaction {
  const raw = stored.raw as Record<string, string>;
  const symbol = stored.symbol ?? undefined;
  const optionLeg = symbol ? parseOptionSymbol(symbol) : null;
  return {
    tradeDate: stored.tradeDate,
    action: ACTION_MAP[stored.actionCanonical],
    rawAction: stored.actionRaw,
    ticker: optionLeg ? optionLeg.underlying : symbol,
    option: optionLeg
      ? {
          ticker: optionLeg.underlying,
          expiry: optionLeg.expiry,
          strike: optionLeg.strike,
          type: optionLeg.callPut === "C" ? "Call" : "Put",
        }
      : undefined,
    quantity: stored.quantity ?? 0,
    price: stored.price ?? undefined,
    fees: stored.fees ?? 0,
    amount: stored.amount,
    raw: {
      Date: raw.Date ?? "",
      Action: raw.Action ?? "",
      Symbol: raw.Symbol ?? "",
      Description: raw.Description ?? "",
      Quantity: raw.Quantity ?? "",
      Price: raw.Price ?? "",
      "Fees & Comm": raw["Fees & Comm"] ?? "",
      Amount: raw.Amount ?? "",
    },
  };
}

function snapshotForDateToLegacy(
  snap: SnapshotForDate | null,
): PositionsSnapshot | null {
  if (!snap || snap.rows.length === 0) return null;

  let cash = 0;
  let totalValue = 0;
  const shares: PositionsSnapshot["shares"] = [];
  const options: PositionsSnapshot["options"] = [];

  for (const r of snap.rows) {
    totalValue += r.marketValue ?? 0;
    if (r.assetType === "cash") {
      cash += r.marketValue ?? 0;
    } else if (r.assetType === "equity") {
      const qty = r.quantity ?? 0;
      const totalCost = r.costBasis ?? 0;
      shares.push({
        ticker: r.symbol,
        quantity: qty,
        price: r.price ?? 0,
        marketValue: r.marketValue ?? 0,
        costBasis: qty === 0 ? 0 : totalCost / qty,
      });
    } else if (r.assetType === "option") {
      const leg = parseOptionSymbol(r.symbol);
      if (!leg) continue;
      options.push({
        underlying: leg.underlying,
        expiry: leg.expiry,
        strike: leg.strike,
        callPut: leg.callPut,
        quantity: r.quantity ?? 0,
        price: r.price ?? 0,
        marketValue: r.marketValue ?? 0,
        delta: null,
        theta: null,
        intrinsicValue: null,
      });
    }
  }

  return { asOf: snap.asOf, cash, totalValue, shares, options, sourceFile: "(db)" };
}
