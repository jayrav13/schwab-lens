"use client";
import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Action, Transaction } from "@/lib/csv/types";
import {
  filterTransactions,
  sortTransactions,
  parseTransactionsQuery,
  serializeTransactionsQuery,
  type TransactionsFilter,
  type TransactionsSort,
  type TransactionsSortKey,
} from "@/lib/model/filters/transactions";
import { formatCurrency } from "@/lib/util/money";

const ACTION_LABEL: Record<string, string> = {
  SellToOpen: "STO",
  BuyToClose: "BTC",
  Expired: "EXP",
  Assigned: "ASN",
  Buy: "BUY",
  Sell: "SELL",
  QualifiedDividend: "DIV",
  BankInterest: "INT",
  CreditInterest: "INT",
  Journal: "JRN",
  WireSent: "WIR",
  MiscCashEntry: "MSC",
  ServiceFee: "FEE",
  Unknown: "???",
};

const ACTION_STYLES: Record<string, string> = {
  SellToOpen: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  BuyToClose: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  Expired: "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-gray-200",
  Assigned: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  Buy: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  Sell: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
};

function describe(t: Transaction): string {
  if (t.option) {
    const e = `${t.option.expiry.slice(5, 7)}/${t.option.expiry.slice(8, 10)}`;
    return `${t.option.ticker} ${e} $${t.option.strike.toFixed(2)} ${t.option.type[0]} × ${t.quantity}`;
  }
  if (t.ticker) {
    return `${t.ticker} ${t.quantity ? `× ${t.quantity}` : ""}`;
  }
  return t.raw.Description ?? t.rawAction;
}

export function TransactionsPageClient({
  transactions,
}: {
  transactions: Transaction[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const { filter, sort } = useMemo(
    () => parseTransactionsQuery(new URLSearchParams(sp.toString())),
    [sp],
  );

  const updateQuery = useCallback(
    (nextFilter: TransactionsFilter, nextSort: TransactionsSort) => {
      const qs = serializeTransactionsQuery(nextFilter, nextSort).toString();
      router.replace(qs ? `/transactions?${qs}` : "/transactions");
    },
    [router],
  );

  const allActions = useMemo(() => {
    const seen = new Map<Action, string>();
    for (const t of transactions) {
      if (!seen.has(t.action)) seen.set(t.action, t.rawAction);
    }
    return Array.from(seen.keys()).sort();
  }, [transactions]);

  const allTickers = useMemo(
    () =>
      Array.from(
        new Set(transactions.map((t) => t.ticker).filter((x): x is string => !!x)),
      ).sort(),
    [transactions],
  );

  const filtered = useMemo(
    () => sortTransactions(filterTransactions(transactions, filter), sort),
    [transactions, filter, sort],
  );

  const netAmount = filtered.reduce((a, t) => a + t.amount, 0);

  const toggleAction = (a: Action) => {
    const next = new Set(filter.actions);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    updateQuery({ ...filter, actions: next }, sort);
  };
  const toggleTicker = (t: string) => {
    const next = new Set(filter.tickers);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    updateQuery({ ...filter, tickers: next }, sort);
  };
  const setFrom = (v: string) =>
    updateQuery({ ...filter, from: v || undefined }, sort);
  const setTo = (v: string) =>
    updateQuery({ ...filter, to: v || undefined }, sort);
  const setQ = (v: string) => updateQuery({ ...filter, q: v }, sort);
  const setSort = (key: TransactionsSortKey) => {
    const nextDir =
      sort.key === key ? (sort.dir === "asc" ? "desc" : "asc") : "desc";
    updateQuery(filter, { key, dir: nextDir });
  };
  const clearAll = () =>
    updateQuery(
      { actions: new Set(), tickers: new Set(), q: "" },
      { key: "tradeDate", dir: "desc" },
    );

  const hasFilter =
    filter.actions.size > 0 ||
    filter.tickers.size > 0 ||
    filter.from != null ||
    filter.to != null ||
    filter.q.trim().length > 0;

  const arrow = (key: TransactionsSortKey) =>
    sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
          Transactions
        </h3>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} matching · net{" "}
          <span
            className={
              netAmount >= 0
                ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                : "text-rose-700 dark:text-rose-400 font-semibold"
            }
          >
            {netAmount === 0
              ? "$0.00"
              : `${netAmount >= 0 ? "+" : "−"}${formatCurrency(Math.abs(netAmount))}`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
            Action
          </div>
          <div className="flex flex-wrap gap-1">
            {allActions.map((a) => {
              const on = filter.actions.has(a);
              return (
                <button
                  key={a}
                  onClick={() => toggleAction(a)}
                  className={`px-2 py-0.5 rounded border text-[11px] ${
                    on
                      ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
                      : "bg-white dark:bg-neutral-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-neutral-700"
                  }`}
                >
                  {ACTION_LABEL[a] ?? a}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
            Ticker
          </div>
          <div className="flex flex-wrap gap-1">
            {allTickers.map((t) => {
              const on = filter.tickers.has(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTicker(t)}
                  className={`px-2 py-0.5 rounded border text-[11px] ${
                    on
                      ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
                      : "bg-white dark:bg-neutral-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-neutral-700"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-2 items-end">
          <label className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
              From (trade date)
            </div>
            <input
              type="date"
              value={filter.from ?? ""}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
              To
            </div>
            <input
              type="date"
              value={filter.to ?? ""}
              onChange={(e) => setTo(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100"
            />
          </label>
        </div>
        <div className="flex gap-2 items-end">
          <label className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
              Search
            </div>
            <input
              placeholder="ticker or description…"
              value={filter.q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </label>
          {hasFilter && (
            <button
              onClick={clearAll}
              className="text-[11px] px-2 py-1 border border-gray-300 dark:border-neutral-700 rounded hover:bg-gray-50 dark:hover:bg-neutral-800 text-gray-600 dark:text-gray-300"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-4">
          No transactions match these filters.
        </p>
      ) : (
        <div>
          <div className="grid grid-cols-[100px_1fr_120px] gap-2 py-1 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-neutral-800">
            <span
              className="cursor-pointer select-none"
              onClick={() => setSort("tradeDate")}
            >
              Date{arrow("tradeDate")}
            </span>
            <span>Description</span>
            <span
              className="text-right cursor-pointer select-none"
              onClick={() => setSort("amount")}
            >
              Amount{arrow("amount")}
            </span>
          </div>
          {filtered.map((t, i) => (
            <div
              key={i}
              className="grid grid-cols-[100px_1fr_120px] gap-2 py-1.5 border-b border-gray-100 dark:border-neutral-800 last:border-0 text-xs"
            >
              <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                {t.tradeDate.slice(5).replace("-", "/")}
              </span>
              <span>
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1 ${
                    ACTION_STYLES[t.action] ??
                    "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-gray-200"
                  }`}
                >
                  {ACTION_LABEL[t.action] ?? t.action}
                </span>
                {describe(t)}
              </span>
              <span
                className={`text-right tabular-nums font-semibold ${
                  t.amount > 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : t.amount < 0
                      ? "text-red-700 dark:text-red-400"
                      : "text-gray-400 dark:text-gray-500"
                }`}
              >
                {t.amount === 0 ? "—" : formatCurrency(t.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
