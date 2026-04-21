"use client";
import { useMemo, useState } from "react";
import type { Transaction } from "@/lib/csv/types";
import { formatCurrency } from "@/lib/util/money";

type Props = { transactions: Transaction[] };

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

export function TransactionLogCard({ transactions }: Props) {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<string>("All");
  const [limit, setLimit] = useState(20);

  const sorted = useMemo(
    () =>
      [...transactions].sort((a, b) =>
        a.tradeDate < b.tradeDate ? 1 : a.tradeDate > b.tradeDate ? -1 : 0,
      ),
    [transactions],
  );

  const actionOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of sorted) {
      if (!seen.has(t.action)) seen.set(t.action, t.rawAction);
    }
    return [["All", "All"] as [string, string], ...seen.entries()];
  }, [sorted]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((t) => {
      if (action !== "All" && t.action !== action) return false;
      if (!q) return true;
      const hay = `${t.ticker ?? ""} ${t.raw.Description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, search, action]);

  const visible = filtered.slice(0, limit);

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

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        Transaction log
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Searchable. Most recent first. Showing {visible.length} of{" "}
        {filtered.length}.
      </p>

      <div className="flex gap-2 mb-2">
        <input
          placeholder="search ticker or description…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(20);
          }}
          className="flex-1 text-xs px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
        />
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setLimit(20);
          }}
          className="text-xs px-2 py-1.5 border border-gray-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100"
        >
          {actionOptions.map(([value, display]) => (
            <option key={value} value={value}>
              {display}
            </option>
          ))}
        </select>
      </div>

      <div>
        {visible.map((t, i) => (
          <div
            key={i}
            className="grid grid-cols-[72px_1fr_100px] gap-2 py-1.5 border-b border-gray-100 dark:border-neutral-800 last:border-0 text-xs"
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

      {limit < filtered.length && (
        <button
          onClick={() => setLimit(limit + 20)}
          className="mt-3 text-xs px-3 py-1.5 border border-gray-300 dark:border-neutral-700 rounded hover:bg-gray-50 dark:hover:bg-neutral-800"
        >
          Show more
        </button>
      )}
    </div>
  );
}
