import type { PortfolioState } from "@/lib/model/types";
import type { MarkToMarket } from "@/lib/model/metrics/mark_to_market";
import { formatCurrency } from "@/lib/util/money";

type Props = { state: PortfolioState; markToMarket: MarkToMarket | null };

export function SummaryStrip({ state, markToMarket }: Props) {
  const nav = state.navSeries.at(-1)?.nav ?? state.config.seedValue;
  const cumulativeExternal = state.externalFlows.reduce(
    (a, e) => a + e.signedAmount,
    0,
  );
  const hasHonestSeed = state.config.seedValue > 0 && state.config.seedDate !== "";
  const gain = nav - state.config.seedValue - cumulativeExternal;
  const returnPct = hasHonestSeed ? gain / state.config.seedValue : 0;
  const finalCash =
    state.cashLedger.at(-1)?.balance ?? state.config.seedValue;
  const sharesAtCost = state.openSharePositions.reduce(
    (a, s) => a + s.shares * s.weightedCostBasis,
    0,
  );
  const pctColor = returnPct >= 0 ? "text-emerald-600" : "text-red-600";
  const deltaColor = gain >= 0 ? "text-emerald-600" : "text-red-600";

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <Card
          label="Options Income NAV"
          value={formatCurrency(nav)}
          delta={
            hasHonestSeed
              ? `${gain >= 0 ? "+" : "−"}${formatCurrency(Math.abs(gain))} since seed`
              : `as of ${state.navSeries.at(-1)?.date ?? "—"}`
          }
          deltaClass={hasHonestSeed ? deltaColor : undefined}
        />
        <Card
          label="Return since seed"
          value={hasHonestSeed ? `${(returnPct * 100).toFixed(2)}%` : "—"}
          valueClass={hasHonestSeed ? pctColor : "text-gray-400 dark:text-gray-500"}
          delta={
            hasHonestSeed
              ? `external flows ${formatCurrency(cumulativeExternal)}`
              : "no seed configured"
          }
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

      {markToMarket !== null && markToMarket.rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Card
            label="Portfolio Value (live)"
            value={formatCurrency(markToMarket.portfolioValue)}
            valueClass={
              markToMarket.portfolioValue >= markToMarket.optionsIncomeNav
                ? "text-emerald-600"
                : "text-red-600"
            }
            delta={`${markToMarket.portfolioValue >= markToMarket.optionsIncomeNav ? "+" : "−"}${formatCurrency(Math.abs(markToMarket.portfolioValue - markToMarket.optionsIncomeNav))} vs. Options Income${markToMarket.missingQuotes.length > 0 ? ` · ${markToMarket.missingQuotes.length} ticker(s) missing` : ""}`}
          />
          <Card
            label="Unrealized on held shares"
            value={formatCurrency(markToMarket.totalUnrealized)}
            valueClass={
              markToMarket.totalUnrealized >= 0
                ? "text-emerald-600"
                : "text-red-600"
            }
            delta={`${((markToMarket.totalUnrealized / sharesAtCost) * 100 || 0).toFixed(2)}% vs. cost basis`}
          />
        </div>
      )}
    </>
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
      <div className={`text-2xl font-bold mt-0.5 ${valueClass ?? ""}`}>
        {value}
      </div>
      <div className={`text-xs mt-0.5 ${deltaClass ?? "text-gray-500 dark:text-gray-400"}`}>
        {delta}
      </div>
    </div>
  );
}
