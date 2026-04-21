import type { PortfolioState } from "@/lib/model/types";
import { groupPremiumsByMonth } from "@/lib/model/metrics/premiums";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState };

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
};

export function PremiumsCard({ state }: Props) {
  const months = groupPremiumsByMonth(state.transactions);
  const maxTotal = Math.max(1, ...months.map((m) => m.gross + m.closed));
  const maxPx = 130;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        Premiums collected
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Monthly — green is gross (STO); red stacked on top is paid to close
        (BTC). Value below each bar is that month&rsquo;s net.
      </p>
      <div className="flex items-end gap-3 h-[180px] overflow-hidden">
        {months.map((m) => {
          const grossPx = (m.gross / maxTotal) * maxPx;
          const closedPx = (m.closed / maxTotal) * maxPx;
          return (
            <div
              key={m.month}
              className="flex-1 flex flex-col items-center justify-end h-full"
            >
              <div className="w-full flex flex-col">
                <div
                  className="bg-red-300"
                  style={{ height: `${closedPx}px`, minHeight: 2 }}
                />
                <div
                  className="bg-emerald-600 rounded-t-sm"
                  style={{ height: `${grossPx}px`, minHeight: 2 }}
                />
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                {MONTH_LABELS[m.month.slice(5)] ?? m.month}
              </div>
              <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(m.net).replace(/\.00$/, "")}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 text-[11px] text-gray-500 dark:text-gray-400 mt-3">
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-600 mr-1 align-middle" />
          Gross {formatCurrency(state.premiumTotals.gross)}
        </span>
        <span>
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-300 mr-1 align-middle" />
          Closed −{formatCurrency(state.premiumTotals.closed)}
        </span>
        <strong className="text-emerald-700 dark:text-emerald-400">
          Net {formatCurrency(state.premiumTotals.net)}
        </strong>
      </div>
    </div>
  );
}
