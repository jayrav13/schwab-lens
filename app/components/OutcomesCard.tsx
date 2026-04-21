import type { PortfolioState } from "@/lib/model/types";
import { computeOutcomes, type OutcomeCategory } from "@/lib/model/metrics/outcomes";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState };

const LABEL: Record<OutcomeCategory, string> = {
  Expired: "Expired (premium kept)",
  ClosedProfit: "Closed for profit",
  ClosedLoss: "Closed for loss",
  Assigned: "Assigned",
};

const STYLE: Record<OutcomeCategory, string> = {
  Expired: "text-emerald-700 dark:text-emerald-400",
  ClosedProfit: "text-emerald-700 dark:text-emerald-400",
  ClosedLoss: "text-red-700 dark:text-red-400",
  Assigned: "text-amber-700 dark:text-amber-400",
};

export function OutcomesCard({ state }: Props) {
  const rows = computeOutcomes(state.transactions);
  const totalClosed = rows.reduce((a, r) => a + r.contractCount, 0);
  const wins =
    (rows.find((r) => r.category === "Expired")?.contractCount ?? 0) +
    (rows.find((r) => r.category === "ClosedProfit")?.contractCount ?? 0);
  const winRate = totalClosed === 0 ? 0 : wins / totalClosed;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        Contract outcomes
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        How each closed contract resolved. Win rate ={" "}
        <strong className="text-emerald-700 dark:text-emerald-400">
          {(winRate * 100).toFixed(0)}%
        </strong>{" "}
        ({wins} of {totalClosed}).
      </p>
      {rows.map((r) => (
        <div
          key={r.category}
          className="flex justify-between py-1.5 border-b border-gray-100 dark:border-neutral-800 last:border-0 text-[13px]"
        >
          <div>
            <span className={STYLE[r.category]}>
              {LABEL[r.category]}
            </span>
          </div>
          <div className="text-right tabular-nums">
            <strong>{r.contractCount}</strong>
            <span className="text-[11px] text-gray-500 dark:text-gray-400 ml-2">
              {r.grossPremiumImpact === 0
                ? "—"
                : (r.grossPremiumImpact > 0 ? "+" : "−") +
                  formatCurrency(Math.abs(r.grossPremiumImpact))}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
