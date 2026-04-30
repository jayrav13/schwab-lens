import type { NavStripData } from "@/lib/server/accountOverview";
import { formatCurrency } from "@/lib/util/money";

type Props = {
  nav: NavStripData;
  cash: number;
  holdingsCount: number;
};

export function OverviewSummaryStrip({ nav, cash, holdingsCount }: Props) {
  const { current, changeAmount, changePct, computation } = nav;
  const positive = changeAmount >= 0;
  const periodLabel = computation.period;
  const sign = positive ? "+" : "−";

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
      <Card
        label="NAV"
        value={formatCurrency(current)}
        delta={`as of ${computation.end}`}
      />
      <Card
        label={`Return · ${periodLabel}`}
        value={`${positive ? "+" : ""}${(changePct * 100).toFixed(2)}%`}
        valueClass={positive ? "text-emerald-600" : "text-red-600"}
        delta={`${sign}${formatCurrency(Math.abs(changeAmount))} since ${computation.effectiveStart}`}
        deltaClass={positive ? "text-emerald-600" : "text-red-600"}
      />
      <Card
        label="Cash"
        value={formatCurrency(cash)}
        delta={current > 0 ? `${((cash / current) * 100).toFixed(1)}% of NAV` : "—"}
      />
      <Card
        label="Holdings"
        value={holdingsCount.toString()}
        delta={holdingsCount === 1 ? "ticker" : "tickers"}
      />
    </div>
  );
}

function Card({
  label,
  value,
  delta,
  valueClass,
  deltaClass,
}: {
  label: string;
  value: string;
  delta: string;
  valueClass?: string;
  deltaClass?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className={`text-2xl font-bold mt-0.5 tabular-nums ${valueClass ?? ""}`}>
        {value}
      </div>
      <div className={`text-xs mt-0.5 ${deltaClass ?? "text-gray-500 dark:text-gray-400"}`}>
        {delta}
      </div>
    </div>
  );
}
