import { getDb } from "@/lib/db/connection";
import { getAccountByUuid } from "@/lib/db/repos/accounts";
import { listTransactionsByAccount } from "@/lib/db/repos/transactions";
import type { AccountTabFlags } from "@/app/components/AccountTabs";

const OPTION_ACTIONS = new Set([
  "SELL_TO_OPEN",
  "BUY_TO_OPEN",
  "BUY_TO_CLOSE",
  "SELL_TO_CLOSE",
  "ASSIGNMENT",
  "EXERCISE",
  "EXPIRATION",
]);

const TRADE_ACTIONS = new Set([
  "BUY",
  "SELL",
  "SELL_TO_OPEN",
  "BUY_TO_OPEN",
  "BUY_TO_CLOSE",
  "SELL_TO_CLOSE",
]);

export async function getAccountTabFlags(
  uuid: string,
): Promise<AccountTabFlags | null> {
  const db = getDb();
  const account = getAccountByUuid(db, uuid);
  if (!account) return null;
  const txs = listTransactionsByAccount(db, account.id);
  return {
    showOptions: txs.some((t) => OPTION_ACTIONS.has(t.action_canonical)),
    showTrades: txs.some((t) => TRADE_ACTIONS.has(t.action_canonical)),
  };
}
