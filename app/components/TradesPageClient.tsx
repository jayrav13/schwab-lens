"use client";
import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ClosedTrade, TradeOutcome } from "@/lib/model/types";
import {
  filterTrades,
  sortTrades,
  parseTradesQuery,
  serializeTradesQuery,
  type TradesFilter,
  type TradesSort,
  type TradesSortKey,
} from "@/lib/model/filters/trades";
import { formatCurrency } from "@/lib/util/money";

const ALL_OUTCOMES: TradeOutcome[] = [
  "Expired",
  "Assigned",
  "ClosedProfit",
  "ClosedLoss",
];

const OUTCOME_LABEL: Record<TradeOutcome, string> = {
  Expired: "Expired",
  Assigned: "Assigned",
  ClosedProfit: "Profit",
  ClosedLoss: "Loss",
};

function outcomeBadgeClasses(outcome: TradeOutcome): string {
  if (outcome === "ClosedLoss") {
    return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300";
  }
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
}

function formatContract(c: ClosedTrade["contract"]): string {
  return `${c.ticker} $${c.strike.toFixed(2)} ${c.type[0]}`;
}

export function TradesPageClient({
  trades,
  uuid,
}: {
  trades: ClosedTrade[];
  uuid: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const basePath = `/accounts/${uuid}/trades`;

  const { filter, sort } = useMemo(
    () => parseTradesQuery(new URLSearchParams(sp.toString())),
    [sp],
  );

  const updateQuery = useCallback(
    (nextFilter: TradesFilter, nextSort: TradesSort) => {
      const qs = serializeTradesQuery(nextFilter, nextSort).toString();
      router.replace(qs ? `${basePath}?${qs}` : basePath);
    },
    [router, basePath],
  );

  const allTickers = useMemo(
    () => Array.from(new Set(trades.map((t) => t.contract.ticker))).sort(),
    [trades],
  );

  const filtered = useMemo(
    () => sortTrades(filterTrades(trades, filter), sort),
    [trades, filter, sort],
  );

  const netPnL = filtered.reduce((a, t) => a + t.netPnL, 0);

  const toggleTicker = (ticker: string) => {
    const next = new Set(filter.tickers);
    if (next.has(ticker)) next.delete(ticker);
    else next.add(ticker);
    updateQuery({ ...filter, tickers: next }, sort);
  };
  const toggleOutcome = (o: TradeOutcome) => {
    const next = new Set(filter.outcomes);
    if (next.has(o)) next.delete(o);
    else next.add(o);
    updateQuery({ ...filter, outcomes: next }, sort);
  };
  const setFrom = (v: string) =>
    updateQuery({ ...filter, from: v || undefined }, sort);
  const setTo = (v: string) =>
    updateQuery({ ...filter, to: v || undefined }, sort);
  const setSort = (key: TradesSortKey) => {
    const nextDir =
      sort.key === key ? (sort.dir === "asc" ? "desc" : "asc") : "desc";
    updateQuery(filter, { key, dir: nextDir });
  };
  const clearAll = () =>
    updateQuery(
      { tickers: new Set(), outcomes: new Set() },
      { key: "closeDate", dir: "desc" },
    );

  const hasFilter =
    filter.tickers.size > 0 ||
    filter.outcomes.size > 0 ||
    filter.from != null ||
    filter.to != null;

  const arrow = (key: TradesSortKey) =>
    sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
          Closed trades
        </h3>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} matching · net{" "}
          <span
            className={
              netPnL >= 0
                ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                : "text-rose-700 dark:text-rose-400 font-semibold"
            }
          >
            {netPnL >= 0 ? "+" : "−"}
            {formatCurrency(Math.abs(netPnL))}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 text-xs">
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
                  className={`px-2 py-0.5 rounded border text-[11px] cursor-pointer ${
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
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
            Outcome
          </div>
          <div className="flex flex-wrap gap-1">
            {ALL_OUTCOMES.map((o) => {
              const on = filter.outcomes.has(o);
              return (
                <button
                  key={o}
                  onClick={() => toggleOutcome(o)}
                  className={`px-2 py-0.5 rounded border text-[11px] cursor-pointer ${
                    on
                      ? "bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100"
                      : "bg-white dark:bg-neutral-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-neutral-700"
                  }`}
                >
                  {OUTCOME_LABEL[o]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-2 items-end">
          <label className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
              From (close date)
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
        <div className="flex items-end">
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
          No trades match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-neutral-800">
                <th className="py-1.5 pr-3">Contract</th>
                <th className="py-1.5 pr-3">Opened</th>
                <th
                  className="py-1.5 pr-3 cursor-pointer select-none"
                  onClick={() => setSort("closeDate")}
                >
                  Closed{arrow("closeDate")}
                </th>
                <th className="py-1.5 pr-3 text-right">Qty</th>
                <th
                  className="py-1.5 pr-3 text-right cursor-pointer select-none"
                  onClick={() => setSort("daysHeld")}
                >
                  Held{arrow("daysHeld")}
                </th>
                <th className="py-1.5 pr-3">Outcome</th>
                <th
                  className="py-1.5 text-right cursor-pointer select-none"
                  onClick={() => setSort("netPnL")}
                >
                  P&amp;L{arrow("netPnL")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-100 dark:border-neutral-800 last:border-0"
                >
                  <td className="py-1.5 pr-3">
                    <div className="font-semibold">{formatContract(t.contract)}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      exp {t.contract.expiry.slice(5)}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3">
                    <div>{t.openDate.slice(5)}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      ${t.openPrice.toFixed(2)}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3">
                    <div>{t.closeDate.slice(5)}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      {t.outcome === "Expired" || t.outcome === "Assigned"
                        ? "—"
                        : `$${t.closePrice.toFixed(2)}`}
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 text-right">{t.qty}</td>
                  <td className="py-1.5 pr-3 text-right">{t.daysHeld}d</td>
                  <td className="py-1.5 pr-3">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${outcomeBadgeClasses(t.outcome)}`}
                    >
                      {OUTCOME_LABEL[t.outcome]}
                    </span>
                  </td>
                  <td
                    className={`py-1.5 text-right font-semibold ${t.netPnL >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
                  >
                    {t.netPnL >= 0 ? "+" : "−"}
                    {formatCurrency(Math.abs(t.netPnL))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
