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
  SellToOpen: "bg-emerald-100 text-emerald-800",
  BuyToClose: "bg-red-100 text-red-800",
  Expired: "bg-gray-100 text-gray-700",
  Assigned: "bg-amber-100 text-amber-800",
  Buy: "bg-blue-100 text-blue-800",
  Sell: "bg-indigo-100 text-indigo-800",
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

  const actionOptions = useMemo(
    () => ["All", ...Array.from(new Set(sorted.map((t) => t.action)))],
    [sorted],
  );

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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-0.5">
        Transaction log
      </h3>
      <p className="text-xs text-gray-500 mb-3">
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
          className="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded bg-white"
        />
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setLimit(20);
          }}
          className="text-xs px-2 py-1.5 border border-gray-300 rounded bg-white"
        >
          {actionOptions.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>

      <div>
        {visible.map((t, i) => (
          <div
            key={i}
            className="grid grid-cols-[72px_1fr_100px] gap-2 py-1.5 border-b border-gray-100 last:border-0 text-xs"
          >
            <span className="text-gray-500 tabular-nums">
              {t.tradeDate.slice(5).replace("-", "/")}
            </span>
            <span>
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1 ${
                  ACTION_STYLES[t.action] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {ACTION_LABEL[t.action] ?? t.action}
              </span>
              {describe(t)}
            </span>
            <span
              className={`text-right tabular-nums font-semibold ${
                t.amount > 0
                  ? "text-emerald-700"
                  : t.amount < 0
                    ? "text-red-700"
                    : "text-gray-400"
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
          className="mt-3 text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
        >
          Show more
        </button>
      )}
    </div>
  );
}
