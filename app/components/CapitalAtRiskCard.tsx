import type { PortfolioState } from "@/lib/model/types";
import { computeCapitalAtRisk } from "@/lib/model/metrics/capital";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState };

export function CapitalAtRiskCard({ state }: Props) {
  const v = computeCapitalAtRisk(state);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200 mb-0.5">
        Capital at risk
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        How much of NAV is deployed in open puts and held shares vs. free.
      </p>

      <div className="h-3 rounded-full bg-gray-100 dark:bg-neutral-800 overflow-hidden flex mb-3">
        <div
          className="bg-indigo-500"
          style={{ width: `${(v.putCollateral / v.nav) * 100}%` }}
          title={`Put collateral ${formatCurrency(v.putCollateral)}`}
        />
        <div
          className="bg-amber-500"
          style={{ width: `${(v.sharesAtCost / v.nav) * 100}%` }}
          title={`Shares at cost ${formatCurrency(v.sharesAtCost)}`}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
        <Tile label="Put collateral" value={formatCurrency(v.putCollateral)} swatch="bg-indigo-500" />
        <Tile label="Shares at cost" value={formatCurrency(v.sharesAtCost)} swatch="bg-amber-500" />
        <Tile label="Deployed" value={`${(v.deployedPctOfNav * 100).toFixed(1)}% of NAV`} />
        <Tile label="Free" value={`${(v.freePctOfNav * 100).toFixed(1)}% of NAV`} />
      </div>
    </div>
  );
}

function Tile({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1">
        {swatch ? <span className={`inline-block w-2 h-2 rounded-sm ${swatch}`} /> : null}
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
