import type { PortfolioState } from "@/lib/model/types";
import { groupPremiumsByTicker } from "@/lib/model/metrics/premiums";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState };

export function PremiumByTickerCard({ state }: Props) {
  const rows = groupPremiumsByTicker(state.transactions);
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        Premium by ticker
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Ranked by net premium (gross STO minus closed BTC). Assignment count included.
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-2">No option activity yet.</p>
      ) : (
        rows.map((r) => (
          <div
            key={r.ticker}
            className="flex justify-between py-1.5 border-b border-gray-100 dark:border-neutral-800 last:border-0 text-[13px]"
          >
            <div>
              <strong>{r.ticker}</strong>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                gross {formatCurrency(r.gross)} · closed −{formatCurrency(r.closed)}
                {r.assignmentCount > 0
                  ? ` · ${r.assignmentCount} assign`
                  : ""}
              </div>
            </div>
            <div
              className={`text-right font-semibold tabular-nums ${
                r.net >= 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-700 dark:text-red-400"
              }`}
            >
              {r.net >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(r.net))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
