import type { Action, Transaction } from "@/lib/csv/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ALL_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "SellToOpen",
  "BuyToClose",
  "Expired",
  "Assigned",
  "Buy",
  "Sell",
  "QualifiedDividend",
  "BankInterest",
  "CreditInterest",
  "Journal",
  "WireSent",
  "MiscCashEntry",
  "ServiceFee",
  "Unknown",
]);

export type TransactionsFilter = {
  actions: Set<Action>;
  tickers: Set<string>;
  from?: string;
  to?: string;
  q: string;
};

export type TransactionsSortKey = "tradeDate" | "amount";
export type SortDir = "asc" | "desc";
export type TransactionsSort = { key: TransactionsSortKey; dir: SortDir };

const DEFAULT_SORT: TransactionsSort = { key: "tradeDate", dir: "desc" };

export function filterTransactions(
  transactions: Transaction[],
  f: TransactionsFilter,
): Transaction[] {
  const q = f.q.trim().toLowerCase();
  return transactions.filter((t) => {
    if (f.actions.size > 0 && !f.actions.has(t.action)) return false;
    if (f.tickers.size > 0) {
      if (!t.ticker || !f.tickers.has(t.ticker)) return false;
    }
    if (f.from != null && t.tradeDate < f.from) return false;
    if (f.to != null && t.tradeDate > f.to) return false;
    if (q.length > 0) {
      const hay = `${t.ticker ?? ""} ${t.raw.Description ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortTransactions(
  transactions: Transaction[],
  s: TransactionsSort,
): Transaction[] {
  const sign = s.dir === "asc" ? 1 : -1;
  return [...transactions].sort((a, b) => {
    let diff = 0;
    if (s.key === "tradeDate") {
      diff = a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0;
    } else {
      diff = a.amount - b.amount;
    }
    return sign * diff;
  });
}

export function parseTransactionsQuery(sp: URLSearchParams): {
  filter: TransactionsFilter;
  sort: TransactionsSort;
} {
  const actions = new Set<Action>(
    (sp.get("action") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is Action => ALL_ACTIONS.has(s as Action)),
  );
  const tickers = new Set(
    (sp.get("ticker") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  const fromRaw = sp.get("from") ?? undefined;
  const toRaw = sp.get("to") ?? undefined;
  const from = fromRaw && ISO_DATE.test(fromRaw) ? fromRaw : undefined;
  const to = toRaw && ISO_DATE.test(toRaw) ? toRaw : undefined;
  const q = sp.get("q") ?? "";

  const sortRaw = sp.get("sort") ?? "";
  const [rawKey, rawDir] = sortRaw.split(":");
  const validKey: TransactionsSortKey | null =
    rawKey === "tradeDate" || rawKey === "amount" ? rawKey : null;
  const validDir: SortDir | null =
    rawDir === "asc" || rawDir === "desc" ? rawDir : null;
  const sort: TransactionsSort =
    validKey && validDir ? { key: validKey, dir: validDir } : DEFAULT_SORT;

  return { filter: { actions, tickers, from, to, q }, sort };
}

export function serializeTransactionsQuery(
  f: TransactionsFilter,
  s: TransactionsSort,
): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.actions.size > 0) {
    sp.set("action", Array.from(f.actions).sort().join(","));
  }
  if (f.tickers.size > 0) {
    sp.set("ticker", Array.from(f.tickers).sort().join(","));
  }
  if (f.from) sp.set("from", f.from);
  if (f.to) sp.set("to", f.to);
  if (f.q.trim().length > 0) sp.set("q", f.q);
  if (s.key !== DEFAULT_SORT.key || s.dir !== DEFAULT_SORT.dir) {
    sp.set("sort", `${s.key}:${s.dir}`);
  }
  return sp;
}
