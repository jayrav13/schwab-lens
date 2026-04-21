import type { PortfolioState } from "@/lib/model/types";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState };

export function SummaryStrip({ state }: Props) {
  const nav = state.navSeries.at(-1)?.nav ?? state.config.seedValue;
  const cumulativeExternal = state.externalFlows.reduce(
    (a, e) => a + e.signedAmount,
    0,
  );
  const gain = nav - state.config.seedValue - cumulativeExternal;
  const returnPct = gain / state.config.seedValue;
  const finalCash =
    state.cashLedger.at(-1)?.balance ?? state.config.seedValue;
  const sharesAtCost = state.openSharePositions.reduce(
    (a, s) => a + s.shares * s.weightedCostBasis,
    0,
  );
  const pctColor = returnPct >= 0 ? "text-emerald-600" : "text-red-600";
  const deltaColor = gain >= 0 ? "text-emerald-600" : "text-red-600";

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
      <Card
        label="Options Income NAV"
        value={formatCurrency(nav)}
        delta={`${gain >= 0 ? "+" : "−"}${formatCurrency(Math.abs(gain))} since seed`}
        deltaClass={deltaColor}
      />
      <Card
        label="Return since seed"
        value={`${(returnPct * 100).toFixed(2)}%`}
        valueClass={pctColor}
        delta={`external flows ${formatCurrency(cumulativeExternal)}`}
      />
      <Card
        label="Cash"
        value={formatCurrency(finalCash)}
        delta={`${((finalCash / nav) * 100).toFixed(1)}% of NAV`}
      />
      <Card
        label="Shares at cost"
        value={formatCurrency(sharesAtCost)}
        delta={
          state.openSharePositions.length
            ? `${state.openSharePositions.length} ticker(s)`
            : "none"
        }
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
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className={`text-2xl font-bold mt-0.5 ${valueClass ?? ""}`}>
        {value}
      </div>
      <div className={`text-xs mt-0.5 ${deltaClass ?? "text-gray-500"}`}>
        {delta}
      </div>
    </div>
  );
}
