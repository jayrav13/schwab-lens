import Link from "next/link";
import type {
  ClosedTrade,
  PortfolioState,
  TradeOutcome,
} from "@/lib/model/types";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState };

const PREVIEW_COUNT = 5;

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

function sortedDesc(trades: ClosedTrade[]): ClosedTrade[] {
  return [...trades].sort((a, b) => {
    if (a.closeDate !== b.closeDate) return a.closeDate < b.closeDate ? 1 : -1;
    if (a.openDate !== b.openDate) return a.openDate < b.openDate ? -1 : 1;
    return 0;
  });
}

export function TradeHistoryCard({ state }: Props) {
  const all = sortedDesc(state.closedTrades ?? []);
  const preview = all.slice(0, PREVIEW_COUNT);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-baseline justify-between mb-0.5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
          Closed trades
        </h3>
        {all.length > 0 && (
          <Link
            href="/trades"
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            View all {all.length} →
          </Link>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Most recent {preview.length} of {all.length}.
      </p>
      {preview.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
          No closed trades yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-neutral-800">
                <th className="py-1.5 pr-3">Contract</th>
                <th className="py-1.5 pr-3">Closed</th>
                <th className="py-1.5 pr-3">Outcome</th>
                <th className="py-1.5 text-right">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((t, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-100 dark:border-neutral-800 last:border-0"
                >
                  <td className="py-1.5 pr-3 font-semibold">
                    {formatContract(t.contract)}
                  </td>
                  <td className="py-1.5 pr-3">{t.closeDate.slice(5)}</td>
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
